/**
 * Kursgliederung (Projektkonzept Kapitel 3). Die Inhalte der Lektionen liegen als MDX unter
 * `src/content/lernen/<modul>/<lektion>.mdx`, die Quizfragen pro Modul hier.
 */
export type Lesson = { slug: string; title: string; minutes: number };

export type QuizQuestion = {
  question: string;
  options: string[];
  /** Index der richtigen Antwort */
  answer: number;
  explanation: string;
};

export type CourseModule = {
  slug: string;
  title: string;
  summary: string;
  lessons: Lesson[];
  quiz: QuizQuestion[];
};

export const COURSE: CourseModule[] = [
  {
    slug: "grundlagen",
    title: "Grundlagen",
    summary: "Was SSH ist und warum Keys sicherer sind als Passwörter.",
    lessons: [
      { slug: "was-ist-ssh", title: "Was ist SSH?", minutes: 5 },
      { slug: "passwort-oder-key", title: "Passwort oder SSH-Key?", minutes: 5 },
      { slug: "public-und-private-key", title: "Public Key und Private Key einfach erklärt", minutes: 7 },
      { slug: "fingerprint-und-known-hosts", title: "Fingerprint, known_hosts und die Warnung beim ersten Verbinden", minutes: 8 },
    ],
    quiz: [
      {
        question: "Welchen Teil eines Schlüsselpaars darfst du bedenkenlos weitergeben?",
        options: ["Den Private Key", "Den Public Key", "Beide", "Keinen von beiden"],
        answer: 1,
        explanation: "Der Public Key ist das Schloss. Er darf auf jeden Server. Der Private Key ist der Schlüssel und bleibt immer bei dir.",
      },
      {
        question: "Was bedeutet die Frage „The authenticity of host … can't be established“ beim ersten Verbinden?",
        options: [
          "Der Server ist gehackt",
          "Dein Key ist falsch",
          "Dein Rechner kennt den Server noch nicht und fragt, ob der Fingerprint stimmt",
          "Die Verbindung ist unverschlüsselt",
        ],
        answer: 2,
        explanation: "Beim ersten Kontakt kennt dein Rechner den Host-Key noch nicht. Vergleiche den Fingerprint mit dem, den dir dein Hoster anzeigt.",
      },
      {
        question: "Auf welchem Port lauscht SSH standardmäßig?",
        options: ["21", "22", "80", "443"],
        answer: 1,
        explanation: "SSH nutzt standardmäßig TCP-Port 22.",
      },
      {
        question: "Was passiert, wenn sich der Host-Key eines bekannten Servers plötzlich ändert?",
        options: [
          "Nichts, SSH merkt das nicht",
          "SSH warnt laut und verweigert die Verbindung",
          "SSH ändert automatisch dein Passwort",
          "Der Private Key wird gelöscht",
        ],
        answer: 1,
        explanation: "Eine Änderung kann ein Angriff sein (Man-in-the-Middle). Nur wenn du sicher weißt, warum (z. B. Server neu installiert), entfernst du den alten Eintrag.",
      },
    ],
  },
  {
    slug: "keys-erstellen",
    title: "Keys erstellen",
    summary: "Den richtigen Key-Typ wählen und auf jedem Betriebssystem erzeugen.",
    lessons: [
      { slug: "key-typen", title: "Ed25519, RSA oder ECDSA?", minutes: 5 },
      { slug: "ssh-keygen-linux-macos", title: "ssh-keygen unter Linux und macOS", minutes: 6 },
      { slug: "windows", title: "Windows: OpenSSH in PowerShell und PuTTYgen", minutes: 8 },
      { slug: "passphrase", title: "Passphrase: wozu und wie", minutes: 5 },
      { slug: "hardware-keys", title: "Hardware-Keys (YubiKey, ed25519-sk)", minutes: 7 },
      { slug: "dateien-und-rechte", title: "Wo die Dateien liegen und welche Rechte sie brauchen", minutes: 6 },
    ],
    quiz: [
      {
        question: "Welcher Key-Typ ist heute die beste Wahl für neue Keys?",
        options: ["DSA", "RSA 1024", "Ed25519", "ECDSA mit 256 Bit"],
        answer: 2,
        explanation: "Ed25519 ist schnell, kurz, modern und wird von allen aktuellen Systemen unterstützt.",
      },
      {
        question: "Welche Rechte braucht die Datei mit deinem Private Key?",
        options: ["777", "644", "600", "755"],
        answer: 2,
        explanation: "600 bedeutet: nur du darfst lesen und schreiben. Sonst verweigert SSH den Key mit „UNPROTECTED PRIVATE KEY FILE“.",
      },
      {
        question: "Wozu dient eine Passphrase?",
        options: [
          "Sie ersetzt das Server-Passwort",
          "Sie verschlüsselt den Private Key auf deiner Festplatte",
          "Sie wird an den Server geschickt",
          "Sie ist nur für Windows nötig",
        ],
        answer: 1,
        explanation: "Wird dein Laptop gestohlen, ist der Key ohne Passphrase nutzlos. Der Server erfährt die Passphrase nie.",
      },
      {
        question: "Mit welchem Befehl änderst du die Passphrase eines bestehenden Keys?",
        options: ["ssh-keygen -p", "ssh-add -D", "passwd", "ssh-copy-id -p"],
        answer: 0,
        explanation: "`ssh-keygen -p -f ~/.ssh/id_ed25519` fragt nach der alten und der neuen Passphrase.",
      },
    ],
  },
  {
    slug: "keys-hinterlegen",
    title: "Keys auf dem Server hinterlegen",
    summary: "authorized_keys verstehen und Keys sicher auf Server bringen.",
    lessons: [
      { slug: "authorized-keys", title: "authorized_keys: Ort, Format, Rechte", minutes: 6 },
      { slug: "ssh-copy-id", title: "ssh-copy-id und das Gegenstück für Windows", minutes: 6 },
      { slug: "konsole-des-hosters", title: "Über die Konsole des Hosters", minutes: 5 },
      { slug: "keys-beim-hoster", title: "Keys beim Hoster hinterlegen", minutes: 4 },
      { slug: "mehrere-keys-und-optionen", title: "Mehrere Keys und Optionen in authorized_keys", minutes: 7 },
      { slug: "keys-entfernen-und-rotieren", title: "Keys entfernen und rotieren", minutes: 6 },
    ],
    quiz: [
      {
        question: "In welcher Datei auf dem Server stehen die erlaubten Public Keys eines Benutzers?",
        options: ["~/.ssh/known_hosts", "~/.ssh/authorized_keys", "/etc/ssh/sshd_config", "~/.ssh/id_ed25519"],
        answer: 1,
        explanation: "Jede Zeile in `~/.ssh/authorized_keys` ist ein Public Key, der sich als dieser Benutzer anmelden darf.",
      },
      {
        question: "Welche Rechte braucht der Ordner ~/.ssh auf dem Server?",
        options: ["700", "777", "644", "711"],
        answer: 0,
        explanation: "700: nur der Besitzer darf hinein. Mit zu offenen Rechten ignoriert sshd die Keys.",
      },
      {
        question: "Was macht die Option `from=\"203.0.113.0/24\"` vor einem Key in authorized_keys?",
        options: [
          "Sie erlaubt den Key nur von diesen IP-Adressen",
          "Sie leitet Port 203 weiter",
          "Sie setzt den Kommentar",
          "Sie macht den Key zum Root-Key",
        ],
        answer: 0,
        explanation: "So kann ein geleakter Key von anderswo nicht benutzt werden.",
      },
      {
        question: "Ein Mitarbeiter verlässt das Team. Was ist zu tun?",
        options: [
          "Nichts, sein Key läuft von allein ab",
          "Seinen Public Key aus allen authorized_keys entfernen",
          "Den Server neu installieren",
          "Das Root-Passwort ändern genügt",
        ],
        answer: 1,
        explanation: "Normale Keys laufen nie ab. Sie müssen auf jedem Server entfernt werden. Die SSH-Academy kann das für dich erledigen.",
      },
    ],
  },
  {
    slug: "komfortabel-arbeiten",
    title: "Komfortabel arbeiten",
    summary: "ssh-agent, ~/.ssh/config und Jump-Hosts.",
    lessons: [
      { slug: "ssh-agent", title: "ssh-agent und ssh-add", minutes: 6 },
      { slug: "ssh-config", title: "~/.ssh/config: Kurznamen für Server", minutes: 7 },
      { slug: "agent-forwarding-und-proxyjump", title: "Agent-Forwarding und warum ProxyJump besser ist", minutes: 6 },
      { slug: "jump-host", title: "Jump-Host / Bastion", minutes: 5 },
      { slug: "vscode-git-github", title: "SSH in VS Code, Git und GitHub", minutes: 7 },
    ],
    quiz: [
      {
        question: "Wofür ist der ssh-agent da?",
        options: [
          "Er merkt sich entsperrte Keys, damit du die Passphrase nicht ständig eingeben musst",
          "Er ist ein Virenscanner für SSH",
          "Er ersetzt den SSH-Server",
          "Er erzeugt automatisch neue Keys",
        ],
        answer: 0,
        explanation: "Einmal `ssh-add` und die Passphrase eingeben, danach nutzt SSH den Key aus dem Agent.",
      },
      {
        question: "Was ist der Vorteil von ProxyJump gegenüber Agent-Forwarding?",
        options: [
          "Es ist schneller",
          "Der Jump-Host bekommt keinen Zugriff auf deinen Agent",
          "Es braucht keinen Key",
          "Es funktioniert nur unter Windows",
        ],
        answer: 1,
        explanation: "Bei Agent-Forwarding kann root auf dem Jump-Host deinen Agent missbrauchen. ProxyJump leitet nur die verschlüsselte Verbindung durch.",
      },
      {
        question: "Wie verbindest du dich nach diesem Eintrag in ~/.ssh/config? `Host web` / `HostName 203.0.113.10` / `User anna`",
        options: ["ssh anna@web", "ssh web", "ssh 203.0.113.10 web", "ssh -c web"],
        answer: 1,
        explanation: "Der Kurzname `web` reicht. SSH setzt Adresse und Benutzer aus der Config ein.",
      },
    ],
  },
  {
    slug: "benutzer-ubuntu-debian",
    title: "Benutzer unter Ubuntu und Debian",
    summary: "Eigene Benutzer mit sudo-Rechten anlegen statt als root zu arbeiten.",
    lessons: [
      { slug: "warum-nicht-root", title: "Warum nicht dauerhaft als root?", minutes: 4 },
      { slug: "adduser-oder-useradd", title: "adduser oder useradd?", minutes: 5 },
      { slug: "sudo-rechte", title: "sudo-Rechte vergeben (inkl. Debian-Besonderheiten)", minutes: 6 },
      { slug: "visudo-und-sudoers-d", title: "visudo und /etc/sudoers.d", minutes: 7 },
      { slug: "key-fuer-neuen-benutzer", title: "Key für den neuen Benutzer einrichten", minutes: 6 },
      { slug: "benutzer-verwalten", title: "Benutzer sperren, löschen, Gruppen verwalten", minutes: 6 },
      { slug: "login-testen", title: "Test: funktioniert der neue Login?", minutes: 4 },
    ],
    quiz: [
      {
        question: "Mit welchem Befehl bekommt der Benutzer anna sudo-Rechte (Ubuntu und Debian)?",
        options: ["sudo anna", "usermod -aG sudo anna", "chmod +sudo anna", "adduser sudo"],
        answer: 1,
        explanation: "`-aG` hängt die Gruppe an (append). Ohne `-a` würden alle anderen Gruppen entfernt.",
      },
      {
        question: "Warum solltest du die sudoers-Datei nur mit visudo bearbeiten?",
        options: [
          "Weil andere Editoren verboten sind",
          "visudo prüft die Syntax. Ein Tippfehler könnte sonst sudo komplett lahmlegen",
          "visudo ist schneller",
          "Damit die Änderung an alle Server geht",
        ],
        answer: 1,
        explanation: "Eine kaputte sudoers-Datei sperrt dich aus sudo aus. visudo speichert nur gültige Dateien.",
      },
      {
        question: "Auf einem frischen Debian ohne sudo: was ist zu tun?",
        options: [
          "Debian kann kein sudo",
          "Als root `apt install sudo` und danach den Benutzer zur Gruppe sudo hinzufügen",
          "Den Benutzer root nennen",
          "Ubuntu installieren",
        ],
        answer: 1,
        explanation: "Bei Debian-Installationen mit Root-Passwort ist sudo oft nicht installiert.",
      },
      {
        question: "Wann meldest du dich als root ab, nachdem du einen neuen sudo-Benutzer eingerichtet hast?",
        options: [
          "Sofort",
          "Erst wenn der Login mit dem neuen Benutzer und Key sowie sudo in einer zweiten Sitzung funktioniert",
          "Nie",
          "Nach einem Neustart",
        ],
        answer: 1,
        explanation: "Immer erst testen, dann die alte Sitzung schließen. So sperrst du dich nicht aus.",
      },
    ],
  },
  {
    slug: "root-login",
    title: "Root per SSH-Key: Vor- und Nachteile",
    summary: "Wann Root-Login vertretbar ist und warum ein eigener Benutzer besser ist.",
    lessons: [
      { slug: "root-per-key", title: "Root per Key", minutes: 5 },
      { slug: "eigener-benutzer-mit-sudo", title: "Eigener Benutzer mit sudo", minutes: 5 },
      { slug: "empfehlung-und-umstellung", title: "Empfehlung und Umstellung", minutes: 7 },
    ],
    quiz: [
      {
        question: "Was bewirkt `PermitRootLogin prohibit-password`?",
        options: [
          "root darf sich gar nicht anmelden",
          "root darf sich nur mit Key, nicht mit Passwort anmelden",
          "root braucht ein besonders langes Passwort",
          "Alle Benutzer brauchen ein Passwort",
        ],
        answer: 1,
        explanation: "Ein Kompromiss für Automatisierung. Für Menschen ist `no` plus eigener Benutzer besser.",
      },
      {
        question: "Was ist der größte Vorteil eines eigenen Benutzers mit sudo gegenüber root?",
        options: [
          "Er ist schneller",
          "Man sieht, wer was getan hat, und Rechte lassen sich gezielt vergeben",
          "Er braucht keinen Key",
          "Er funktioniert ohne Internet",
        ],
        answer: 1,
        explanation: "sudo protokolliert, wer welchen Befehl ausgeführt hat. Bei einem gemeinsamen root-Zugang weiß das niemand.",
      },
    ],
  },
  {
    slug: "server-absichern",
    title: "Server absichern",
    summary: "sshd richtig konfigurieren, ohne sich auszusperren.",
    lessons: [
      { slug: "sshd-config-und-drop-ins", title: "sshd_config und Drop-ins in sshd_config.d", minutes: 6 },
      { slug: "cloud-init-stolperfalle", title: "Stolperfalle 50-cloud-init.conf", minutes: 5 },
      { slug: "passwort-und-root-login-abschalten", title: "Passwort-Login und Root-Login abschalten", minutes: 6 },
      { slug: "sicher-neu-laden", title: "Konfiguration testen und sicher neu laden", minutes: 5 },
      { slug: "port-aendern", title: "Port ändern (ssh.socket unter Ubuntu 24.04)", minutes: 7 },
      { slug: "firewall-und-fail2ban", title: "Firewall und Fail2ban", minutes: 8 },
      { slug: "automatische-updates", title: "Automatische Sicherheitsupdates", minutes: 4 },
    ],
    quiz: [
      {
        question: "Du hast `PasswordAuthentication no` in /etc/ssh/sshd_config.d/99-sicher.conf gesetzt, aber Passwort-Login geht trotzdem. Warum?",
        options: [
          "Der Server muss neu installiert werden",
          "Eine frühere Datei (z. B. 50-cloud-init.conf) setzt yes, und bei sshd gewinnt der erste gefundene Wert",
          "Die Datei muss .txt heißen",
          "PasswordAuthentication gibt es nicht",
        ],
        answer: 1,
        explanation: "Dateien werden alphabetisch gelesen, der erste Wert gilt. Nenne deine Datei z. B. 01-sicher.conf oder passe 50-cloud-init.conf an.",
      },
      {
        question: "Mit welchem Befehl prüfst du die sshd-Konfiguration auf Fehler?",
        options: ["sshd -t", "ssh -v", "systemctl status ssh", "ssh-keygen -t"],
        answer: 0,
        explanation: "`sudo sshd -t` gibt nichts aus, wenn alles stimmt, sonst die fehlerhafte Zeile.",
      },
      {
        question: "Was solltest du tun, bevor du sshd mit neuer Konfiguration neu lädst?",
        options: [
          "Alle Sitzungen schließen",
          "Eine zweite Sitzung offen lassen und danach in einer neuen Sitzung testen",
          "Den Server ausschalten",
          "Den Private Key löschen",
        ],
        answer: 1,
        explanation: "Bestehende Sitzungen bleiben beim Neuladen erhalten. Über sie kannst du einen Fehler korrigieren.",
      },
      {
        question: "Ubuntu 24.04: Wo änderst du den SSH-Port, wenn ssh.socket aktiv ist?",
        options: [
          "Nur in sshd_config",
          "In einem Override für ssh.socket (ListenStream) und danach systemctl daemon-reload",
          "In /etc/hosts",
          "Gar nicht, das geht nicht",
        ],
        answer: 1,
        explanation: "Mit Socket Activation bestimmt systemd den Port. `Port` in sshd_config wird dann ignoriert.",
      },
    ],
  },
  {
    slug: "fortgeschritten",
    title: "Fortgeschritten",
    summary: "SSH-Zertifikate, Tunnel und Key-Management im Team.",
    lessons: [
      { slug: "ssh-zertifikate", title: "SSH-Zertifikate", minutes: 9 },
      { slug: "tunnel", title: "Port-Forwarding und Tunnel", minutes: 7 },
      { slug: "key-management-im-team", title: "Key-Management im Team", minutes: 6 },
      { slug: "fehlersuche", title: "Fehlersuche", minutes: 8 },
    ],
    quiz: [
      {
        question: "Was ist der Vorteil von SSH-Zertifikaten?",
        options: [
          "Sie sind kürzer",
          "Server vertrauen einer CA, Zugänge laufen automatisch ab und müssen nicht überall eingetragen werden",
          "Sie brauchen keinen Private Key",
          "Sie funktionieren ohne Verschlüsselung",
        ],
        answer: 1,
        explanation: "Ein Eintrag `TrustedUserCAKeys` auf dem Server genügt. Ablauf und Rechte stehen im Zertifikat.",
      },
      {
        question: "Was macht `ssh -L 8080:localhost:80 server`?",
        options: [
          "Öffnet Port 8080 auf dem Server",
          "Leitet deinen lokalen Port 8080 auf Port 80 des Servers weiter",
          "Ändert den SSH-Port auf 8080",
          "Lädt eine Datei herunter",
        ],
        answer: 1,
        explanation: "So erreichst du einen Dienst, der nur auf dem Server lauscht, über http://localhost:8080.",
      },
      {
        question: "Welche Option zeigt beim Verbinden ausführliche Fehlerinformationen?",
        options: ["ssh -q", "ssh -v", "ssh -x", "ssh -N"],
        answer: 1,
        explanation: "`-v` (bis `-vvv`) zeigt, welche Keys probiert werden und woran es scheitert.",
      },
    ],
  },
];

export function findModule(slug: string) {
  return COURSE.find((m) => m.slug === slug);
}

export function findLesson(moduleSlug: string, lessonSlug: string) {
  const mod = findModule(moduleSlug);
  const index = mod?.lessons.findIndex((l) => l.slug === lessonSlug) ?? -1;
  if (!mod || index < 0) return null;
  return { module: mod, lesson: mod.lessons[index]!, index };
}

export function lessonKey(moduleSlug: string, lessonSlug: string) {
  return `${moduleSlug}/${lessonSlug}`;
}

/** Alle Lektionen in Kursreihenfolge (für Weiter/Zurück und Fortschritt) */
export const ALL_LESSONS = COURSE.flatMap((m) =>
  m.lessons.map((l) => ({ module: m, lesson: l, key: lessonKey(m.slug, l.slug) })),
);
