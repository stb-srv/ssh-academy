/** Kursgliederung (Projektkonzept Kapitel 3). Die Lektionen selbst folgen als MDX in Phase 1. */
export type CourseModule = {
  slug: string;
  title: string;
  summary: string;
  lessons: string[];
};

export const COURSE: CourseModule[] = [
  {
    slug: "grundlagen",
    title: "Grundlagen",
    summary: "Was SSH ist und warum Keys sicherer sind als Passwörter.",
    lessons: [
      "Was ist SSH?",
      "Passwort oder SSH-Key?",
      "Public Key und Private Key einfach erklärt",
      "Fingerprint, known_hosts und die Warnung beim ersten Verbinden",
    ],
  },
  {
    slug: "keys-erstellen",
    title: "Keys erstellen",
    summary: "Den richtigen Key-Typ wählen und auf jedem Betriebssystem erzeugen.",
    lessons: [
      "Ed25519, RSA oder ECDSA?",
      "ssh-keygen unter Linux und macOS",
      "Windows: OpenSSH in PowerShell und PuTTYgen",
      "Passphrase: wozu und wie",
      "Hardware-Keys (YubiKey, ed25519-sk)",
      "Wo die Dateien liegen und welche Rechte sie brauchen",
    ],
  },
  {
    slug: "keys-hinterlegen",
    title: "Keys auf dem Server hinterlegen",
    summary: "authorized_keys verstehen und Keys sicher auf Server bringen.",
    lessons: [
      "authorized_keys: Ort, Format, Rechte",
      "ssh-copy-id und das Gegenstück für Windows",
      "Über die Konsole des Hosters",
      "Keys beim Hoster hinterlegen",
      "Mehrere Keys und Optionen in authorized_keys",
      "Keys entfernen und rotieren",
    ],
  },
  {
    slug: "komfortabel-arbeiten",
    title: "Komfortabel arbeiten",
    summary: "ssh-agent, ~/.ssh/config und Jump-Hosts.",
    lessons: [
      "ssh-agent und ssh-add",
      "~/.ssh/config: Kurznamen für Server",
      "Agent-Forwarding und warum ProxyJump besser ist",
      "Jump-Host / Bastion",
      "SSH in VS Code, Git und GitHub",
    ],
  },
  {
    slug: "benutzer-ubuntu-debian",
    title: "Benutzer unter Ubuntu und Debian",
    summary: "Eigene Benutzer mit sudo-Rechten anlegen statt als root zu arbeiten.",
    lessons: [
      "Warum nicht dauerhaft als root?",
      "adduser oder useradd?",
      "sudo-Rechte vergeben (inkl. Debian-Besonderheiten)",
      "visudo und /etc/sudoers.d",
      "Key für den neuen Benutzer einrichten",
      "Benutzer sperren, löschen, Gruppen verwalten",
      "Test: funktioniert der neue Login?",
    ],
  },
  {
    slug: "root-login",
    title: "Root per SSH-Key: Vor- und Nachteile",
    summary: "Wann Root-Login vertretbar ist und warum ein eigener Benutzer besser ist.",
    lessons: ["Root per Key", "Eigener Benutzer mit sudo", "Empfehlung und Umstellung"],
  },
  {
    slug: "server-absichern",
    title: "Server absichern",
    summary: "sshd richtig konfigurieren, ohne sich auszusperren.",
    lessons: [
      "sshd_config und Drop-ins in sshd_config.d",
      "Stolperfalle 50-cloud-init.conf",
      "Passwort-Login und Root-Login abschalten",
      "Konfiguration testen und sicher neu laden",
      "Port ändern (ssh.socket unter Ubuntu 24.04)",
      "Firewall und Fail2ban",
      "Automatische Sicherheitsupdates",
    ],
  },
  {
    slug: "fortgeschritten",
    title: "Fortgeschritten",
    summary: "SSH-Zertifikate, Tunnel und Key-Management im Team.",
    lessons: ["SSH-Zertifikate", "Port-Forwarding und Tunnel", "Key-Management im Team", "Fehlersuche"],
  },
];
