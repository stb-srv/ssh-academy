/** Erzeugt eine sshd-Konfigurationsdatei (Drop-in) aus einfachen Antworten. */

export type SshdOptions = {
  port: number;
  /** "no" | "prohibit-password" | "yes" */
  rootLogin: "no" | "prohibit-password" | "yes";
  passwordAuth: boolean;
  allowUsers: string[];
  allowGroups: string[];
  maxAuthTries: number;
  loginGraceTime: number;
  x11Forwarding: boolean;
  tcpForwarding: boolean;
  agentForwarding: boolean;
  clientAliveInterval: number;
  modernCrypto: boolean;
};

export const DEFAULT_SSHD_OPTIONS: SshdOptions = {
  port: 22,
  rootLogin: "no",
  passwordAuth: false,
  allowUsers: [],
  allowGroups: [],
  maxAuthTries: 3,
  loginGraceTime: 30,
  x11Forwarding: false,
  tcpForwarding: false,
  agentForwarding: false,
  clientAliveInterval: 300,
  modernCrypto: true,
};

export const SSHD_DROPIN_PATH = "/etc/ssh/sshd_config.d/10-ssh-academy.conf";

const NAME_RE = /^[a-z_][a-z0-9_.-]{0,31}\$?$/i;

export type SshdWarning = { level: "warn" | "danger"; text: string };

export function validNames(list: string[]) {
  return list.filter((n) => NAME_RE.test(n));
}

export function buildSshdConfig(o: SshdOptions): { config: string; warnings: SshdWarning[] } {
  const yn = (b: boolean) => (b ? "yes" : "no");
  const lines: string[] = [
    "# Erzeugt mit dem sshd-Konfigurator der SSH-Academy",
    `# Datei: ${SSHD_DROPIN_PATH}`,
    "# Vor dem Neustart prüfen: sudo sshd -t",
    "",
  ];
  if (o.port !== 22) lines.push(`Port ${o.port}`);
  lines.push(
    `PermitRootLogin ${o.rootLogin}`,
    `PasswordAuthentication ${yn(o.passwordAuth)}`,
    "KbdInteractiveAuthentication no",
    "PubkeyAuthentication yes",
    "PermitEmptyPasswords no",
    `MaxAuthTries ${o.maxAuthTries}`,
    `LoginGraceTime ${o.loginGraceTime}`,
    `X11Forwarding ${yn(o.x11Forwarding)}`,
    `AllowTcpForwarding ${yn(o.tcpForwarding)}`,
    `AllowAgentForwarding ${yn(o.agentForwarding)}`,
  );
  if (o.clientAliveInterval > 0) lines.push(`ClientAliveInterval ${o.clientAliveInterval}`, "ClientAliveCountMax 2");
  const users = validNames(o.allowUsers);
  const groups = validNames(o.allowGroups);
  if (users.length) lines.push(`AllowUsers ${users.join(" ")}`);
  if (groups.length) lines.push(`AllowGroups ${groups.join(" ")}`);
  if (o.modernCrypto) {
    lines.push(
      "",
      "# Nur moderne Verfahren (OpenSSH 8.x und neuer)",
      "KexAlgorithms sntrup761x25519-sha512@openssh.com,curve25519-sha256,curve25519-sha256@libssh.org",
      "Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com",
      "MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com",
      "HostKeyAlgorithms ssh-ed25519,rsa-sha2-512,rsa-sha2-256,ecdsa-sha2-nistp256",
    );
  }

  const warnings: SshdWarning[] = [];
  if (o.rootLogin === "yes")
    warnings.push({ level: "danger", text: "Root-Login mit Passwort ist das häufigste Ziel von Brute-Force-Angriffen." });
  if (o.passwordAuth)
    warnings.push({ level: "warn", text: "Passwort-Login ist noch an. Schalte ihn erst ab, wenn dein Key-Login sicher funktioniert." });
  if (!o.passwordAuth && o.rootLogin === "no" && users.length === 0 && groups.length === 0)
    warnings.push({
      level: "warn",
      text: "Prüfe vor dem Neustart in einer zweiten Sitzung, dass dein eigener Benutzer sich mit Key und sudo anmelden kann.",
    });
  if (users.length && groups.length)
    warnings.push({ level: "warn", text: "AllowUsers und AllowGroups gleichzeitig: Ein Benutzer muss dann beide Bedingungen erfüllen." });
  if (o.allowUsers.length !== users.length || o.allowGroups.length !== groups.length)
    warnings.push({ level: "warn", text: "Ungültige Benutzer- oder Gruppennamen wurden weggelassen." });
  if (o.port !== 22)
    warnings.push({
      level: "warn",
      text: `Öffne Port ${o.port} vorher in der Firewall (z. B. sudo ufw allow ${o.port}/tcp). Unter Ubuntu ab 22.10 lauscht sshd per Socket-Aktivierung: dort zusätzlich ssh.socket anpassen oder deaktivieren.`,
    });
  if (o.modernCrypto)
    warnings.push({ level: "warn", text: "Sehr alte Clients (z. B. PuTTY vor 0.68) können sich mit den modernen Verfahren nicht mehr verbinden." });
  return { config: lines.join("\n") + "\n", warnings };
}

export function sshdApplySteps(port: number) {
  return [
    `sudo nano ${SSHD_DROPIN_PATH}`,
    "sudo sshd -t",
    "sudo systemctl reload ssh",
    `# In einem ZWEITEN Terminal testen, bevor du das erste schließt:\nssh -p ${port} benutzer@server`,
  ];
}
