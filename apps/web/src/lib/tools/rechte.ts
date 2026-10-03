/** Rechte-Checker: prüft die Ausgabe von `ls -ld ~ ~/.ssh ~/.ssh/*` auf zu offene Dateirechte. */

export type PermFinding = {
  path: string;
  mode: string;
  octal: string;
  owner: string;
  ok: boolean;
  message: string;
  fix?: string;
};

type Rule = { match: (name: string, isDir: boolean) => boolean; maxOctal: number; recommended: string; why: string };

const RULES: Rule[] = [
  { match: (n, d) => d && /(^|\/)\.ssh\/?$/.test(n), maxOctal: 0o700, recommended: "700", why: "Nur du darfst in deinen .ssh-Ordner schauen." },
  { match: (n) => /authorized_keys2?$/.test(n), maxOctal: 0o644, recommended: "600", why: "sshd ignoriert authorized_keys, wenn andere hineinschreiben dürfen." },
  { match: (n) => /\.pub$/.test(n), maxOctal: 0o644, recommended: "644", why: "Public Keys dürfen alle lesen, aber nur du schreiben." },
  { match: (n) => /(known_hosts(\.old)?|config)$/.test(n), maxOctal: 0o644, recommended: "644", why: "Nur du solltest diese Datei ändern können." },
  { match: (n) => /(id_[a-z0-9_-]+|\.pem|\.key)$/.test(n), maxOctal: 0o600, recommended: "600", why: "ssh verweigert Private Keys, die andere lesen können." },
  { match: (_n, d) => d, maxOctal: 0o755, recommended: "755", why: "Dein Home-Verzeichnis darf für andere nicht beschreibbar sein, sonst ignoriert sshd deine Keys." },
];

export function modeToOctal(mode: string) {
  const bits = mode.slice(1, 10);
  let v = 0;
  for (let i = 0; i < 9; i++) {
    const c = bits[i];
    if (c && c !== "-" && c !== "S" && c !== "T") v |= 1 << (8 - i);
  }
  return v;
}

const LINE_RE = /^([dl-])([rwxsStT-]{9})[.@+]?\s+\d+\s+(\S+)\s+(\S+)\s+\d+\s+(?:\S+\s+\S+\s+\S+|\d{4}-\d\d-\d\d\s+\d\d:\d\d)\s+(.+)$/;

/** Nimmt die Ausgabe von `ls -l`/`ls -ld` entgegen. Zeilen, die nicht passen, werden übersprungen. */
export function checkPermissions(output: string): PermFinding[] {
  const findings: PermFinding[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const m = LINE_RE.exec(raw.trim());
    if (!m) continue;
    const [, type, perms, owner, , rawName] = m;
    const name = rawName!.replace(/ -> .*$/, "").trim();
    if (name === "." || name === "..") continue;
    if (type === "l") {
      findings.push({ path: name, mode: type + perms, octal: "", owner: owner!, ok: true, message: "Symbolischer Link, das Ziel zählt." });
      continue;
    }
    const isDir = type === "d";
    const value = modeToOctal(type + perms!);
    const octal = value.toString(8).padStart(3, "0");
    const rule = RULES.find((r) => r.match(name, isDir));
    if (!rule) {
      findings.push({ path: name, mode: type + perms, octal, owner: owner!, ok: true, message: "Keine besondere Regel für diese Datei." });
      continue;
    }
    // Zu offen = ein Bit gesetzt, das die Regel nicht erlaubt
    const tooOpen = (value & ~rule.maxOctal & 0o777) !== 0;
    findings.push({
      path: name,
      mode: type + perms,
      octal,
      owner: owner!,
      ok: !tooOpen,
      message: tooOpen ? `Zu offen (${octal}). ${rule.why}` : `In Ordnung (${octal}).`,
      fix: tooOpen ? `chmod ${rule.recommended} ${shellPath(name)}` : undefined,
    });
  }
  return findings;
}

function shellPath(p: string) {
  return /^[A-Za-z0-9_@%+=:,./~-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`;
}

export const RECHTE_COMMAND = "ls -ld ~ ~/.ssh ~/.ssh/*";
