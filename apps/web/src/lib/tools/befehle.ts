/** Befehls-Baukasten: baut häufige SSH-Befehle aus Formularfeldern zusammen. */

export type CommandInput = {
  user: string;
  host: string;
  port: number;
  keyFile: string;
  alias: string;
  localPath: string;
  remotePath: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  jumpHost: string;
};

export const DEFAULT_COMMAND_INPUT: CommandInput = {
  user: "anna",
  host: "server.example.org",
  port: 22,
  keyFile: "~/.ssh/id_ed25519",
  alias: "meinserver",
  localPath: "./backup.tar.gz",
  remotePath: "/home/anna/",
  localPort: 8080,
  remoteHost: "localhost",
  remotePort: 80,
  jumpHost: "",
};

export type CommandRecipe = { id: string; title: string; description: string; build: (i: CommandInput) => string };

/** Setzt einen Wert in einfache Anführungszeichen, falls er Sonderzeichen enthält (Tilde bleibt erhalten). */
export function shellQuote(v: string) {
  if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(v)) return v;
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

function target(i: CommandInput) {
  return `${i.user ? `${shellQuote(i.user)}@` : ""}${shellQuote(i.host || "server")}`;
}
const portFlag = (i: CommandInput, flag = "-p") => (i.port && i.port !== 22 ? ` ${flag} ${i.port}` : "");
const keyFlag = (i: CommandInput) => (i.keyFile ? ` -i ${shellQuote(i.keyFile)}` : "");
const jumpFlag = (i: CommandInput) => (i.jumpHost ? ` -J ${shellQuote(i.jumpHost)}` : "");

export const RECIPES: CommandRecipe[] = [
  {
    id: "keygen",
    title: "Key erzeugen",
    description: "Neues Ed25519-Schlüsselpaar mit Kommentar anlegen.",
    build: (i) => `ssh-keygen -t ed25519 -a 100 -f ${shellQuote(i.keyFile || "~/.ssh/id_ed25519")} -C ${shellQuote(`${i.user || "ich"}@${i.alias || "rechner"}`)}`,
  },
  {
    id: "copy-id",
    title: "Key auf den Server kopieren",
    description: "Hängt deinen Public Key an ~/.ssh/authorized_keys auf dem Server an.",
    build: (i) => `ssh-copy-id -i ${shellQuote(`${i.keyFile || "~/.ssh/id_ed25519"}.pub`)}${portFlag(i)} ${target(i)}`,
  },
  {
    id: "connect",
    title: "Verbinden",
    description: "Anmelden mit einem bestimmten Key, optional über einen Sprung-Host.",
    build: (i) => `ssh${keyFlag(i)}${portFlag(i)}${jumpFlag(i)} ${target(i)}`,
  },
  {
    id: "scp-up",
    title: "Datei hochladen (scp)",
    description: "Kopiert eine lokale Datei auf den Server.",
    build: (i) => `scp${keyFlag(i)}${portFlag(i, "-P")} ${shellQuote(i.localPath)} ${target(i)}:${shellQuote(i.remotePath)}`,
  },
  {
    id: "scp-down",
    title: "Datei herunterladen (scp)",
    description: "Holt eine Datei vom Server in das aktuelle Verzeichnis.",
    build: (i) => `scp${keyFlag(i)}${portFlag(i, "-P")} ${target(i)}:${shellQuote(i.remotePath)} .`,
  },
  {
    id: "rsync",
    title: "Ordner abgleichen (rsync)",
    description: "Überträgt nur Änderungen, ideal für Backups.",
    build: (i) => {
      const ssh = [i.keyFile && `-i ${i.keyFile}`, i.port !== 22 && `-p ${i.port}`].filter(Boolean).join(" ");
      return `rsync -avz --progress${ssh ? ` -e ${shellQuote(`ssh ${ssh}`)}` : ""} ${shellQuote(i.localPath)} ${target(i)}:${shellQuote(i.remotePath)}`;
    },
  },
  {
    id: "tunnel-local",
    title: "Port-Weiterleitung (lokal)",
    description: "Macht einen Dienst hinter dem Server auf deinem Rechner unter localhost erreichbar.",
    build: (i) => `ssh -N -L ${i.localPort}:${shellQuote(i.remoteHost || "localhost")}:${i.remotePort}${keyFlag(i)}${portFlag(i)} ${target(i)}`,
  },
  {
    id: "socks",
    title: "SOCKS-Proxy",
    description: "Leitet deinen Browser-Verkehr über den Server.",
    build: (i) => `ssh -N -D ${i.localPort}${keyFlag(i)}${portFlag(i)} ${target(i)}`,
  },
  {
    id: "fingerprint",
    title: "Fingerprint anzeigen",
    description: "Zeigt den Fingerprint deines Keys zum Vergleichen.",
    build: (i) => `ssh-keygen -lf ${shellQuote(`${i.keyFile || "~/.ssh/id_ed25519"}.pub`)}`,
  },
  {
    id: "known-hosts-remove",
    title: "Alten Host-Key entfernen",
    description: "Nach einer Neuinstallation des Servers: veralteten Eintrag aus known_hosts löschen.",
    build: (i) => `ssh-keygen -R ${i.port !== 22 ? `'[${i.host}]:${i.port}'` : shellQuote(i.host)}`,
  },
  {
    id: "passphrase",
    title: "Passphrase ändern",
    description: "Setzt oder ändert die Passphrase eines vorhandenen Private Keys.",
    build: (i) => `ssh-keygen -p -f ${shellQuote(i.keyFile || "~/.ssh/id_ed25519")}`,
  },
];

/** Eintrag für ~/.ssh/config */
export function buildConfigEntry(i: CommandInput) {
  const lines = [`Host ${i.alias || "meinserver"}`, `    HostName ${i.host || "server"}`];
  if (i.user) lines.push(`    User ${i.user}`);
  if (i.port && i.port !== 22) lines.push(`    Port ${i.port}`);
  if (i.keyFile) lines.push(`    IdentityFile ${i.keyFile}`, "    IdentitiesOnly yes");
  if (i.jumpHost) lines.push(`    ProxyJump ${i.jumpHost}`);
  return lines.join("\n");
}
