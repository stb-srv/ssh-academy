export type GlossaryEntry = { term: string; id: string; text: string; lesson?: string };

const entries: Omit<GlossaryEntry, "id">[] = [
  { term: "SSH", text: "Secure Shell. Protokoll, um sich verschlüsselt an einem anderen Rechner anzumelden, Befehle auszuführen und Dateien zu übertragen.", lesson: "/lernen/grundlagen/was-ist-ssh" },
  { term: "Client", text: "Das Programm auf deinem Rechner, das die Verbindung aufbaut (ssh, PuTTY, VS Code)." },
  { term: "Server", text: "Der Rechner, auf dem der SSH-Dienst sshd läuft und auf Verbindungen wartet." },
  { term: "sshd", text: "Der SSH-Dienst (Daemon) auf dem Server. Seine Einstellungen stehen in /etc/ssh/sshd_config und /etc/ssh/sshd_config.d/.", lesson: "/lernen/server-absichern/sshd-config-und-drop-ins" },
  { term: "Schlüsselpaar", text: "Zwei zusammengehörige Schlüssel: ein öffentlicher (Public Key) und ein geheimer (Private Key). Was der eine bestätigt, kann nur der andere erzeugt haben.", lesson: "/lernen/grundlagen/public-und-private-key" },
  { term: "Public Key", text: "Der öffentliche Teil deines Schlüsselpaars (Datei mit .pub). Du darfst ihn weitergeben; er kommt auf den Server in authorized_keys." },
  { term: "Private Key", text: "Der geheime Teil deines Schlüsselpaars. Er verlässt nie deinen Rechner und sollte mit einer Passphrase geschützt sein." },
  { term: "Passphrase", text: "Passwort, das deinen Private Key verschlüsselt. Wird die Datei gestohlen, ist sie ohne Passphrase nutzlos.", lesson: "/lernen/keys-erstellen/passphrase" },
  { term: "Ed25519", text: "Moderner Schlüsseltyp mit kurzen Keys, hoher Sicherheit und hoher Geschwindigkeit. Heute die Empfehlung.", lesson: "/lernen/keys-erstellen/key-typen" },
  { term: "RSA", text: "Älterer, sehr verbreiteter Schlüsseltyp. Nur mit mindestens 3072, besser 4096 Bit verwenden." },
  { term: "ECDSA", text: "Schlüsseltyp auf Basis elliptischer Kurven (NIST). Funktioniert gut, Ed25519 ist aber meist die bessere Wahl." },
  { term: "FIDO2 / Security-Key", text: "Hardware-Schlüssel wie ein YubiKey. Der Private Key bleibt im Gerät; für die Anmeldung musst du es berühren (Typen ed25519-sk, ecdsa-sk).", lesson: "/lernen/keys-erstellen/hardware-keys" },
  { term: "ssh-keygen", text: "Programm zum Erzeugen, Prüfen und Verwalten von SSH-Keys.", lesson: "/lernen/keys-erstellen/ssh-keygen-linux-macos" },
  { term: "authorized_keys", text: "Datei ~/.ssh/authorized_keys auf dem Server. Jede Zeile ist ein Public Key, der sich als dieser Benutzer anmelden darf.", lesson: "/lernen/keys-hinterlegen/authorized-keys" },
  { term: "known_hosts", text: "Datei ~/.ssh/known_hosts auf deinem Rechner. Merkt sich die Host-Keys der Server, mit denen du schon verbunden warst.", lesson: "/lernen/grundlagen/fingerprint-und-known-hosts" },
  { term: "Host-Key", text: "Das Schlüsselpaar des Servers selbst. Es beweist dir, dass du mit dem richtigen Server sprichst." },
  { term: "Fingerprint", text: "Kurze Prüfsumme eines Keys (z. B. SHA256:…). Damit vergleichst du Keys, ohne den ganzen Key lesen zu müssen." },
  { term: "ssh-copy-id", text: "Hilfsprogramm, das deinen Public Key auf den Server kopiert und die Rechte richtig setzt.", lesson: "/lernen/keys-hinterlegen/ssh-copy-id" },
  { term: "ssh-agent", text: "Hintergrundprogramm, das entsperrte Keys im Speicher hält, damit du die Passphrase nur einmal eingeben musst.", lesson: "/lernen/komfortabel-arbeiten/ssh-agent" },
  { term: "Agent-Forwarding", text: "Reicht deinen ssh-agent an einen Server weiter. Bequem, aber riskant: wer dort root ist, kann deinen Agent benutzen. ProxyJump ist meist besser.", lesson: "/lernen/komfortabel-arbeiten/agent-forwarding-und-proxyjump" },
  { term: "~/.ssh/config", text: "Persönliche Konfigurationsdatei des Clients. Kurznamen, Benutzer, Ports und Keys pro Server.", lesson: "/lernen/komfortabel-arbeiten/ssh-config" },
  { term: "Jump-Host / Bastion", text: "Ein Server, über den du zu anderen, nicht direkt erreichbaren Servern springst (ssh -J).", lesson: "/lernen/komfortabel-arbeiten/jump-host" },
  { term: "root", text: "Der allmächtige Administrator-Benutzer unter Linux. Direkte Anmeldung als root sollte per SSH abgeschaltet sein.", lesson: "/lernen/benutzer-ubuntu-debian/warum-nicht-root" },
  { term: "sudo", text: "Führt einzelne Befehle mit root-Rechten aus. Unter Ubuntu und Debian bekommt ein Benutzer sudo-Rechte über die Gruppe sudo.", lesson: "/lernen/benutzer-ubuntu-debian/sudo-rechte" },
  { term: "visudo", text: "Sicherer Editor für die sudo-Regeln. Prüft die Syntax, bevor er speichert, damit du dich nicht aussperrst.", lesson: "/lernen/benutzer-ubuntu-debian/visudo-und-sudoers-d" },
  { term: "adduser / useradd", text: "Befehle zum Anlegen von Benutzern. adduser fragt freundlich nach, useradd ist das Werkzeug für Skripte.", lesson: "/lernen/benutzer-ubuntu-debian/adduser-oder-useradd" },
  { term: "PermitRootLogin", text: "sshd-Option: ob und wie root sich anmelden darf (no, prohibit-password, yes).", lesson: "/lernen/root-login/empfehlung-und-umstellung" },
  { term: "PasswordAuthentication", text: "sshd-Option: ob Anmeldung mit Passwort erlaubt ist. Mit funktionierendem Key-Login auf no setzen.", lesson: "/lernen/server-absichern/passwort-und-root-login-abschalten" },
  { term: "Drop-in", text: "Zusätzliche Konfigurationsdatei in einem .d-Ordner (z. B. /etc/ssh/sshd_config.d/). Übersteht Paket-Updates besser als Änderungen an der Hauptdatei." },
  { term: "fail2ban", text: "Sperrt IP-Adressen nach zu vielen fehlgeschlagenen Anmeldeversuchen.", lesson: "/lernen/server-absichern/firewall-und-fail2ban" },
  { term: "ufw", text: "Uncomplicated Firewall. Einfache Firewall-Steuerung unter Ubuntu und Debian." },
  { term: "Port-Weiterleitung / Tunnel", text: "Leitet einen Port durch die SSH-Verbindung, z. B. um eine Datenbank hinter dem Server zu erreichen (ssh -L).", lesson: "/lernen/fortgeschritten/tunnel" },
  { term: "SSH-Zertifikat", text: "Ein von einer Zertifizierungsstelle (CA) signierter Public Key mit Ablaufdatum. Server vertrauen der CA statt jedem einzelnen Key.", lesson: "/lernen/fortgeschritten/ssh-zertifikate" },
  { term: "SFTP", text: "Dateiübertragung über SSH mit Verzeichnisanzeige, wie ein sicheres FTP." },
  { term: "scp", text: "Kopiert Dateien über SSH. Für große oder wiederholte Übertragungen ist rsync oft besser." },
  { term: "Key-Rotation", text: "Regelmäßiges Ersetzen alter Keys durch neue, damit verlorene oder geleakte Keys nicht ewig gültig bleiben.", lesson: "/lernen/keys-hinterlegen/keys-entfernen-und-rotieren" },
  { term: "cloud-init", text: "Richtet Cloud-Server beim ersten Start ein. Legt oft eine Datei an, die PasswordAuthentication wieder einschaltet.", lesson: "/lernen/server-absichern/cloud-init-stolperfalle" },
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const GLOSSARY: GlossaryEntry[] = entries
  .map((e) => ({ ...e, id: slugify(e.term) }))
  .sort((a, b) => a.term.localeCompare(b.term, "de", { sensitivity: "base" }));
