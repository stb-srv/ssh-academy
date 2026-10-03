import type { Distro, SimShell } from "./shell";

export type Aufgabe = {
  id: string;
  titel: string;
  text: string;
  tipp: string;
  /** Lektion zum Nachlesen */
  lektion?: string;
  check: (sh: SimShell) => boolean;
  nurFuer?: Distro;
};

const pubKeyOf = (sh: SimShell, user: string) => {
  const home = sh.homeOf(user);
  for (const t of ["ed25519", "ecdsa", "rsa"]) {
    const n = sh.node(`${home}/.ssh/id_${t}.pub`);
    if (n) return n.content.trim().split(/\s+/).slice(0, 2).join(" ");
  }
  return null;
};

export const AUFGABEN: Aufgabe[] = [
  {
    id: "debian-sudo",
    nurFuer: "debian",
    titel: "sudo auf Debian einrichten",
    text: "Auf Debian ist sudo oft nicht installiert und dein Benutzer schueler darf nichts als root. Werde root, installiere sudo und nimm schueler in die Gruppe sudo auf.",
    tipp: "su -   (root-Passwort: root), dann  apt install sudo  und  usermod -aG sudo schueler. Danach  exit  und neu anmelden:  su - schueler",
    lektion: "/lernen/benutzer-ubuntu-debian/sudo-rechte",
    check: (sh) => sh.inGroup("schueler", "sudo") && sh.session.user === "schueler" && sh.session.groups.has("sudo"),
  },
  {
    id: "keygen",
    titel: "Einen SSH-Key erzeugen",
    text: "Erzeuge als schueler einen Ed25519-Key am Standardort ~/.ssh/id_ed25519.",
    tipp: "ssh-keygen -t ed25519 -C \"schueler@laptop\"  und bei der Frage nach dem Speicherort einfach Enter drücken.",
    lektion: "/lernen/keys-erstellen/ssh-keygen-linux-macos",
    check: (sh) => {
      const priv = sh.node("/home/schueler/.ssh/id_ed25519");
      return Boolean(priv && sh.node("/home/schueler/.ssh/id_ed25519.pub") && (priv.mode & 0o077) === 0);
    },
  },
  {
    id: "adduser",
    titel: "Benutzer anna anlegen",
    text: "Lege den Benutzer anna mit Home-Verzeichnis und Passwort an.",
    tipp: "sudo adduser anna",
    lektion: "/lernen/benutzer-ubuntu-debian/adduser-oder-useradd",
    check: (sh) => sh.hasUser("anna") && Boolean(sh.node("/home/anna")),
  },
  {
    id: "sudo-anna",
    titel: "anna sudo-Rechte geben",
    text: "anna soll Befehle mit sudo ausführen dürfen, ohne dass du die sudoers-Datei anfasst.",
    tipp: "sudo usermod -aG sudo anna   (das -a ist wichtig, sonst verliert anna andere Gruppen)",
    lektion: "/lernen/benutzer-ubuntu-debian/sudo-rechte",
    check: (sh) => sh.inGroup("anna", "sudo"),
  },
  {
    id: "authorized-keys",
    titel: "Deinen Key bei anna hinterlegen",
    text: "Trage deinen Public Key in /home/anna/.ssh/authorized_keys ein. Ordner und Datei müssen anna gehören, .ssh braucht 700 und authorized_keys 600.",
    tipp: "ssh-copy-id anna@localhost  oder von Hand: sudo mkdir -p ~anna/.ssh, cat ~/.ssh/id_ed25519.pub | sudo tee -a ~anna/.ssh/authorized_keys, sudo chown -R anna:anna ~anna/.ssh, sudo chmod 700 ~anna/.ssh, sudo chmod 600 ~anna/.ssh/authorized_keys",
    lektion: "/lernen/keys-hinterlegen/authorized-keys",
    check: (sh) => {
      const pub = pubKeyOf(sh, "schueler");
      const dir = sh.node("/home/anna/.ssh");
      const ak = sh.node("/home/anna/.ssh/authorized_keys");
      return Boolean(pub && dir && ak && ak.content.includes(pub) && dir.owner === "anna" && ak.owner === "anna" && (dir.mode & 0o077) === 0 && (ak.mode & 0o022) === 0);
    },
  },
  {
    id: "key-login",
    titel: "Mit dem Key als anna anmelden",
    text: "Melde dich per SSH als anna an, und zwar mit deinem Key, nicht mit dem Passwort.",
    tipp: "ssh anna@localhost  (danach mit exit zurück zu schueler)",
    lektion: "/lernen/benutzer-ubuntu-debian/login-testen",
    check: (sh) => sh.logins.has("anna:key"),
  },
  {
    id: "haerten",
    titel: "sshd absichern",
    text: "Schalte den Passwort-Login und den direkten root-Login ab. Prüfe die Konfiguration und lade sshd neu, damit die Änderung aktiv wird.",
    tipp: "echo \"PasswordAuthentication no\" | sudo tee /etc/ssh/sshd_config.d/10-haertung.conf, dann echo \"PermitRootLogin no\" | sudo tee -a /etc/ssh/sshd_config.d/10-haertung.conf, sudo sshd -t && sudo systemctl reload ssh",
    lektion: "/lernen/server-absichern/passwort-und-root-login-abschalten",
    check: (sh) => sh.sshdSetting("PasswordAuthentication") === "no" && sh.sshdSetting("PermitRootLogin") === "no",
  },
];

export const aufgabenFuer = (distro: Distro) => AUFGABEN.filter((a) => !a.nurFuer || a.nurFuer === distro);
