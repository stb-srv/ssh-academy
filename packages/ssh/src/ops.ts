/**
 * Befehle, die die Plattform auf Servern ausführt. Web-App und Gateway nutzen dieselben Skripte:
 * die Web-App zeigt sie im Assistenten an (Lerneffekt), das Gateway führt sie aus.
 * Alle Skripte sind POSIX-sh und für Ubuntu und Debian gedacht.
 */

export type RemoteOp = {
  title: string;
  /** Das Skript braucht root-Rechte (läuft dann über sudo, wenn der Login-Benutzer nicht root ist) */
  needsRoot: boolean;
  script: string;
};

export const LINUX_USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/;

export function isValidLinuxUser(name: string) {
  return LINUX_USER_RE.test(name);
}

export function shellQuote(v: string) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(v)) return v;
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

function assertUser(user: string) {
  if (!isValidLinuxUser(user)) throw new Error(`Ungültiger Linux-Benutzername: ${user}`);
}

/** "typ base64" ohne Kommentar: daran wird ein Key in authorized_keys erkannt */
export function keyMaterial(publicKeyLine: string) {
  const [type, data] = publicKeyLine.trim().split(/\s+/);
  if (!type || !data || /[^A-Za-z0-9+/=]/.test(data)) throw new Error("Ungültiger Public Key");
  return `${type} ${data}`;
}

const PRELUDE = "set -eu\nexport LC_ALL=C\n";

/** Gemeinsamer Teil: Home-Verzeichnis und authorized_keys eines Benutzers finden bzw. anlegen */
function authorizedKeysSetup(user: string, asRoot: boolean) {
  return `U=${shellQuote(user)}
HOME_DIR=$(getent passwd "$U" | cut -d: -f6)
if [ -z "$HOME_DIR" ]; then echo "Den Benutzer $U gibt es auf diesem Server nicht." >&2; exit 3; fi
GROUP=$(id -gn "$U")
AK="$HOME_DIR/.ssh/authorized_keys"
${
  asRoot
    ? `install -d -m 700 -o "$U" -g "$GROUP" "$HOME_DIR/.ssh"
[ -f "$AK" ] || install -m 600 -o "$U" -g "$GROUP" /dev/null "$AK"`
    : `install -d -m 700 "$HOME_DIR/.ssh"
[ -f "$AK" ] || install -m 600 /dev/null "$AK"`
}
`;
}

export function detectOs(): RemoteOp {
  return {
    title: "Betriebssystem erkennen",
    needsRoot: false,
    script: `. /etc/os-release 2>/dev/null || true
printf '%s|%s|%s\\n' "\${ID:-unknown}" "\${VERSION_ID:-}" "\${PRETTY_NAME:-unbekannt}"`,
  };
}

export function parseOsOutput(stdout: string) {
  const [id = "unknown", version = "", pretty = ""] = stdout.trim().split("\n").pop()!.split("|");
  const os = id === "ubuntu" || id === "debian" ? id : "other";
  return { os: os as "ubuntu" | "debian" | "other", version, pretty };
}

export function deployKey(opts: { user: string; publicKeyLine: string; asRoot: boolean }): RemoteOp {
  assertUser(opts.user);
  const material = keyMaterial(opts.publicKeyLine);
  return {
    title: `Key für ${opts.user} hinterlegen`,
    needsRoot: opts.asRoot,
    script: `${PRELUDE}${authorizedKeysSetup(opts.user, opts.asRoot)}KEY=${shellQuote(opts.publicKeyLine.trim())}
MATERIAL=${shellQuote(material)}
if grep -qF -- "$MATERIAL" "$AK"; then
  echo "Der Key ist schon eingetragen."
else
  # Fehlt am Dateiende der Zeilenumbruch, zuerst einen anhängen
  if [ -s "$AK" ] && [ "$(tail -c 1 "$AK" | od -An -c | tr -d ' ')" != '\\n' ]; then echo >> "$AK"; fi
  printf '%s\\n' "$KEY" >> "$AK"
  echo "Key eingetragen."
fi
chmod 600 "$AK"
${opts.asRoot ? 'chown "$U:$GROUP" "$AK"\n' : ""}`,
  };
}

export function revokeKey(opts: { user: string; publicKeyLine: string; asRoot: boolean }): RemoteOp {
  assertUser(opts.user);
  const material = keyMaterial(opts.publicKeyLine);
  return {
    title: `Key bei ${opts.user} entfernen`,
    needsRoot: opts.asRoot,
    script: `${PRELUDE}U=${shellQuote(opts.user)}
HOME_DIR=$(getent passwd "$U" | cut -d: -f6)
if [ -z "$HOME_DIR" ]; then echo "Den Benutzer $U gibt es nicht mehr, nichts zu tun."; exit 0; fi
AK="$HOME_DIR/.ssh/authorized_keys"
if [ ! -f "$AK" ]; then echo "Keine authorized_keys vorhanden, nichts zu tun."; exit 0; fi
MATERIAL=${shellQuote(material)}
BEFORE=$(wc -l < "$AK")
TMP=$(mktemp)
grep -vF -- "$MATERIAL" "$AK" > "$TMP" || true
# In die bestehende Datei schreiben, damit Besitzer und Rechte erhalten bleiben
cat "$TMP" > "$AK"
rm -f "$TMP"
AFTER=$(wc -l < "$AK")
echo "Entfernt: $((BEFORE - AFTER)) Zeile(n)."`,
  };
}

export function listAuthorizedKeys(opts: { user: string; asRoot: boolean }): RemoteOp {
  assertUser(opts.user);
  return {
    title: `authorized_keys von ${opts.user} lesen`,
    needsRoot: opts.asRoot,
    script: `${PRELUDE}HOME_DIR=$(getent passwd ${shellQuote(opts.user)} | cut -d: -f6)
[ -n "$HOME_DIR" ] && [ -f "$HOME_DIR/.ssh/authorized_keys" ] && cat "$HOME_DIR/.ssh/authorized_keys" || true`,
  };
}

export function createUser(opts: { user: string; sudo: boolean }): RemoteOp {
  assertUser(opts.user);
  const u = shellQuote(opts.user);
  return {
    title: `Benutzer ${opts.user} anlegen${opts.sudo ? " und sudo erlauben" : ""}`,
    needsRoot: true,
    script: `${PRELUDE}if id ${u} >/dev/null 2>&1; then
  echo "Benutzer ${opts.user} gibt es schon."
else
  adduser --disabled-password --gecos '' ${u}
  echo "Benutzer ${opts.user} angelegt (ohne Passwort, Anmeldung nur per Key)."
fi
${
  opts.sudo
    ? `if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo fehlt (Debian-Minimalinstallation), wird installiert ..."
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq sudo
fi
usermod -aG sudo ${u}
echo "${opts.user} ist jetzt in der Gruppe sudo."
`
    : ""
}`,
  };
}

/** Ein Benutzer ohne Passwort braucht für sudo eine NOPASSWD-Regel; sonst kann er sudo nicht nutzen. */
export function allowPasswordlessSudo(opts: { user: string }): RemoteOp {
  assertUser(opts.user);
  const file = `/etc/sudoers.d/90-ssh-academy-${opts.user}`;
  return {
    title: `sudo ohne Passwort für ${opts.user}`,
    needsRoot: true,
    script: `${PRELUDE}F=${shellQuote(file)}
printf '%s ALL=(ALL) NOPASSWD:ALL\\n' ${shellQuote(opts.user)} > "$F.tmp"
chmod 440 "$F.tmp"
visudo -cf "$F.tmp" >/dev/null
mv "$F.tmp" "$F"
echo "Regel in $F angelegt."`,
  };
}

export function setUserPassword(opts: { user: string }): RemoteOp {
  assertUser(opts.user);
  return {
    title: `Passwort für ${opts.user} setzen`,
    needsRoot: true,
    // Das Passwort kommt über stdin (zweite Zeile nach dem sudo-Passwort), nie in der Befehlszeile
    script: `${PRELUDE}IFS= read -r PW
printf '%s:%s\\n' ${shellQuote(opts.user)} "$PW" | chpasswd
echo "Passwort gesetzt."`,
  };
}

export const SSHD_DROPIN = "/etc/ssh/sshd_config.d/10-ssh-academy.conf";

const RELOAD_SSHD = `if ! { systemctl reload ssh || systemctl reload sshd || service ssh reload; } >/dev/null 2>&1; then
  echo "Die Konfiguration ist gültig, aber sshd ließ sich nicht neu laden. Bitte 'sudo systemctl reload ssh' ausführen." >&2
  exit 6
fi`;

export function applySshdConfig(opts: { config: string }): RemoteOp {
  return {
    title: "sshd-Konfiguration anwenden",
    needsRoot: true,
    script: `${PRELUDE}F=${SSHD_DROPIN}
install -d -m 755 /etc/ssh/sshd_config.d
if ! grep -qiE '^\\s*Include\\s+/etc/ssh/sshd_config.d/' /etc/ssh/sshd_config; then
  echo "Diese sshd_config bindet sshd_config.d nicht ein, die Einstellungen würden nicht greifen." >&2
  exit 4
fi
[ -f "$F" ] && cp "$F" "$F.bak"
cat > "$F" <<'SSH_ACADEMY_EOF'
${opts.config.trimEnd()}
SSH_ACADEMY_EOF
chmod 644 "$F"
if ! sshd -t; then
  echo "sshd -t meldet Fehler, alte Konfiguration wird wiederhergestellt." >&2
  if [ -f "$F.bak" ]; then mv "$F.bak" "$F"; else rm -f "$F"; fi
  exit 5
fi
${RELOAD_SSHD}
echo "Konfiguration geprüft und sshd neu geladen."`,
  };
}

export const CA_FILE = "/etc/ssh/ssh_academy_user_ca.pub";
export const CA_DROPIN = "/etc/ssh/sshd_config.d/20-ssh-academy-ca.conf";

/** Phase 4: Server vertraut der Zertifizierungsstelle der Plattform */
export function installUserCa(opts: { caPublicKeys: string[] }): RemoteOp {
  const keys = opts.caPublicKeys.map((k) => keyMaterial(k)).join("\n");
  return {
    title: "Zertifizierungsstelle auf dem Server hinterlegen",
    needsRoot: true,
    script: `${PRELUDE}cat > ${CA_FILE} <<'SSH_ACADEMY_EOF'
${keys}
SSH_ACADEMY_EOF
chmod 644 ${CA_FILE}
printf 'TrustedUserCAKeys %s\\n' ${CA_FILE} > ${CA_DROPIN}
sshd -t
${RELOAD_SSHD}
echo "Der Server akzeptiert jetzt Zertifikate dieser Zertifizierungsstelle."`,
  };
}

/** Prüft, ob der Login-Benutzer sudo ohne Passwort nutzen kann bzw. in der Gruppe sudo ist */
export function checkPrivileges(): RemoteOp {
  return {
    title: "Rechte prüfen",
    needsRoot: false,
    script: `printf 'user=%s\\n' "$(id -un)"
printf 'groups=%s\\n' "$(id -Gn)"
if [ "$(id -u)" = 0 ]; then echo "sudo=root"; elif sudo -n true 2>/dev/null; then echo "sudo=nopasswd"; else echo "sudo=password"; fi`,
  };
}

export function parsePrivileges(stdout: string) {
  const map = Object.fromEntries(
    stdout
      .trim()
      .split("\n")
      .map((l) => l.split("=") as [string, string]),
  );
  return {
    user: map.user ?? "",
    groups: (map.groups ?? "").split(" ").filter(Boolean),
    sudo: (map.sudo ?? "password") as "root" | "nopasswd" | "password",
  };
}

/** Freier Befehl (Mehrfach-Befehl in Phase 4) */
export function customCommand(command: string, asRoot: boolean): RemoteOp {
  return { title: "Befehl ausführen", needsRoot: asRoot, script: command };
}

/** Befehlszeile, mit der das Gateway ein Skript startet */
export function wrapForExecution(op: RemoteOp, loginUser: string, hasSudoPassword: boolean) {
  const inner = `sh -c ${shellQuote(op.script)}`;
  if (!op.needsRoot || loginUser === "root") return inner;
  // -k: sudo fragt immer und liest genau die erste stdin-Zeile, auch bei zwischengespeicherten Rechten
  return hasSudoPassword ? `sudo -k -S -p '' ${inner}` : `sudo -n ${inner}`;
}
