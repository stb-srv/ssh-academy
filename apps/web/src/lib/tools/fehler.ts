/** Fehler-Doktor: erkennt typische SSH-Fehlermeldungen und erklärt die Lösung. */

export type Diagnosis = {
  id: string;
  title: string;
  patterns: RegExp[];
  cause: string;
  steps: string[];
  commands?: string[];
  lesson?: string;
};

export const DIAGNOSES: Diagnosis[] = [
  {
    id: "host-key-changed",
    title: "Der Host-Key des Servers hat sich geändert",
    patterns: [/REMOTE HOST IDENTIFICATION HAS CHANGED/i, /Host key verification failed/i, /Offending .* key in/i],
    cause:
      "Der Server meldet sich mit einem anderen Schlüssel als beim letzten Mal. Häufigster Grund: der Server wurde neu installiert. Es kann aber auch ein Angriff (Man-in-the-Middle) sein.",
    steps: [
      "Kläre zuerst, ob der Server wirklich neu aufgesetzt wurde. Wenn nicht: nicht verbinden und den Admin fragen.",
      "Vergleiche den neuen Fingerprint mit dem, den der Server selbst anzeigt (Konsole des Hosters oder Proxmox).",
      "Erst dann den alten Eintrag entfernen und neu verbinden.",
    ],
    commands: ["ssh-keygen -R server.example.org", "sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub"],
    lesson: "/lernen/grundlagen/fingerprint-und-known-hosts",
  },
  {
    id: "permission-denied-publickey",
    title: "Permission denied (publickey)",
    patterns: [/Permission denied \(publickey/i, /No supported authentication methods available/i, /Server refused our key/i],
    cause: "Der Server hat keinen passenden Key gefunden oder akzeptiert deinen Key nicht.",
    steps: [
      "Stimmt der Benutzername? `ssh anna@server` statt `ssh server`, wenn dein lokaler Name anders ist.",
      "Liegt dein Public Key in ~/.ssh/authorized_keys des RICHTIGEN Benutzers auf dem Server?",
      "Bietet dein Client überhaupt den richtigen Key an? Mit -v siehst du, welche Keys probiert werden.",
      "Rechte prüfen: ~ nicht für andere beschreibbar, ~/.ssh 700, authorized_keys 600 (siehe Rechte-Checker).",
      "Auf dem Server im Log nachsehen, warum der Key abgelehnt wurde.",
    ],
    commands: ["ssh -v -i ~/.ssh/id_ed25519 anna@server", "sudo journalctl -u ssh -n 50", "sudo tail -n 50 /var/log/auth.log"],
    lesson: "/lernen/keys-hinterlegen/authorized-keys",
  },
  {
    id: "unprotected-private-key",
    title: "Private Key ist für andere lesbar",
    patterns: [/UNPROTECTED PRIVATE KEY FILE/i, /Permissions 0?\d{3,4} for .* are too open/i, /bad permissions/i],
    cause: "ssh benutzt einen Private Key nicht, wenn andere Benutzer ihn lesen könnten.",
    steps: ["Setze die Rechte so, dass nur du den Key lesen kannst.", "Unter Windows: Vererbung entfernen und nur deinem Benutzer Lesezugriff geben."],
    commands: ["chmod 600 ~/.ssh/id_ed25519", "chmod 700 ~/.ssh"],
    lesson: "/lernen/keys-erstellen/dateien-und-rechte",
  },
  {
    id: "connection-refused",
    title: "Connection refused",
    patterns: [/Connection refused/i],
    cause: "Der Server ist erreichbar, aber auf diesem Port lauscht kein SSH-Dienst.",
    steps: [
      "Läuft sshd? Auf dem Server prüfen (über die Konsole, falls SSH nicht geht).",
      "Hat der Server einen anderen Port? Dann mit -p verbinden.",
      "Ist openssh-server überhaupt installiert?",
    ],
    commands: ["sudo systemctl status ssh", "sudo ss -tlnp | grep ssh", "sudo apt install openssh-server"],
  },
  {
    id: "timeout",
    title: "Zeitüberschreitung",
    patterns: [/Connection timed out/i, /Operation timed out/i, /No route to host/i, /Network is unreachable/i],
    cause: "Die Verbindung kommt gar nicht beim Server an. Meist blockiert eine Firewall, oder Adresse bzw. Port sind falsch.",
    steps: [
      "Stimmt die IP-Adresse oder der Name? Mit ping prüfen.",
      "Ist der Port in der Firewall des Servers (ufw) und beim Hoster freigegeben?",
      "Bist du im richtigen Netz (VPN, Heimnetz)?",
    ],
    commands: ["ping -c 3 server.example.org", "sudo ufw status", "nc -vz server.example.org 22"],
  },
  {
    id: "dns",
    title: "Name nicht auflösbar",
    patterns: [/Could not resolve hostname/i, /Name or service not known/i, /nodename nor servname provided/i],
    cause: "Der Rechnername ist unbekannt. Tippfehler, fehlender DNS-Eintrag oder ein Alias, der in ~/.ssh/config fehlt.",
    steps: ["Schreibweise prüfen.", "Mit der IP-Adresse statt dem Namen probieren.", "Falls du einen Alias nutzt: steht er in ~/.ssh/config?"],
    commands: ["getent hosts server.example.org", "ssh -G meinserver | grep -i hostname"],
  },
  {
    id: "too-many-failures",
    title: "Too many authentication failures",
    patterns: [/Too many authentication failures/i],
    cause: "Dein ssh-agent bietet so viele Keys an, dass der Server vor dem richtigen aufgibt (MaxAuthTries).",
    steps: ["Gib den Key gezielt an und erlaube nur diesen.", "Oder trage IdentitiesOnly yes für den Host in ~/.ssh/config ein."],
    commands: ["ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 anna@server", "ssh-add -l"],
    lesson: "/lernen/komfortabel-arbeiten/ssh-config",
  },
  {
    id: "no-matching",
    title: "Keine gemeinsamen Verfahren",
    patterns: [/no matching (host key type|key exchange method|cipher|MAC) found/i, /sign_and_send_pubkey: no mutual signature/i],
    cause: "Client und Server sprechen keine gemeinsamen Verschlüsselungsverfahren. Meist ist eine Seite sehr alt.",
    steps: [
      "Am besten: den alten Server bzw. Client aktualisieren.",
      "Bei alten RSA-Keys (ssh-rsa mit SHA-1): einen neuen Ed25519-Key erzeugen.",
      "Nur übergangsweise das alte Verfahren gezielt für diesen Host erlauben.",
    ],
    commands: ["ssh -Q kex", "ssh -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa altserver"],
  },
  {
    id: "passphrase",
    title: "Passphrase wird ständig abgefragt",
    patterns: [/Enter passphrase for key/i, /incorrect passphrase/i],
    cause: "Dein Key ist mit einer Passphrase geschützt (gut so). Ohne ssh-agent fragt ssh bei jeder Verbindung.",
    steps: ["Starte den ssh-agent und lade den Key einmal pro Sitzung.", "Unter macOS: --apple-use-keychain speichert die Passphrase im Schlüsselbund."],
    commands: ['eval "$(ssh-agent -s)"', "ssh-add ~/.ssh/id_ed25519", "ssh-add --apple-use-keychain ~/.ssh/id_ed25519"],
    lesson: "/lernen/komfortabel-arbeiten/ssh-agent",
  },
  {
    id: "agent",
    title: "Kein ssh-agent erreichbar",
    patterns: [/Could not open a connection to your authentication agent/i, /Error connecting to agent/i, /agent refused operation/i],
    cause: "In dieser Shell läuft kein ssh-agent, oder er ist nicht erreichbar.",
    steps: ["Agent in der aktuellen Shell starten.", "Unter Windows den Dienst „OpenSSH Authentication Agent“ aktivieren."],
    commands: ['eval "$(ssh-agent -s)"', "Get-Service ssh-agent | Set-Service -StartupType Automatic; Start-Service ssh-agent"],
    lesson: "/lernen/komfortabel-arbeiten/ssh-agent",
  },
  {
    id: "invalid-format",
    title: "Key hat ein ungültiges Format",
    patterns: [/invalid format/i, /error in libcrypto/i, /Load key .*: invalid format/i],
    cause: "Die Key-Datei ist beschädigt, hat falsche Zeilenenden (Windows) oder es ist gar kein Private Key.",
    steps: [
      "Prüfe, ob du versehentlich die .pub-Datei als Private Key angegeben hast.",
      "Die Datei muss mit einem Zeilenumbruch enden. Zeilenenden auf LF umstellen.",
      "PuTTY-Keys (.ppk) erst mit PuTTYgen ins OpenSSH-Format exportieren.",
    ],
    commands: ["dos2unix ~/.ssh/id_ed25519", "puttygen key.ppk -O private-openssh -o ~/.ssh/id_ed25519"],
  },
  {
    id: "sudo",
    title: "Benutzer ist nicht in der sudoers-Datei",
    patterns: [/is not in the sudoers file/i, /is not allowed to run sudo/i, /may not run sudo/i],
    cause: "Dein Benutzer hat keine sudo-Rechte.",
    steps: [
      "Als root (oder mit einem anderen sudo-Benutzer) deinen Benutzer zur Gruppe sudo hinzufügen.",
      "Danach einmal ab- und wieder anmelden, damit die neue Gruppe gilt.",
    ],
    commands: ["usermod -aG sudo anna", "groups anna"],
    lesson: "/lernen/benutzer-ubuntu-debian/sudo-rechte",
  },
  {
    id: "broken-pipe",
    title: "Verbindung bricht nach Inaktivität ab",
    patterns: [/Broken pipe/i, /Connection reset by peer/i, /client_loop: send disconnect/i, /Timeout, server .* not responding/i],
    cause: "Ein Router oder eine Firewall unterwegs schließt Verbindungen, über die eine Weile nichts läuft.",
    steps: ["Lass den Client regelmäßig ein Lebenszeichen senden.", "Für lange Aufgaben auf dem Server tmux oder screen benutzen."],
    commands: ["ssh -o ServerAliveInterval=60 anna@server", "tmux new -s arbeit"],
    lesson: "/lernen/komfortabel-arbeiten/ssh-config",
  },
];

export function diagnose(text: string): Diagnosis[] {
  if (!text.trim()) return [];
  return DIAGNOSES.filter((d) => d.patterns.some((p) => p.test(text)));
}
