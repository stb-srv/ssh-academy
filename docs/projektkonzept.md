# SSH-Academy: Projektkonzept

**Stand:** 03.10.2026 · **Version:** 1.1 (Entwurf, ergänzt um Pocket ID) · **Sprache der Plattform:** Deutsch (Englisch vorbereitet)

> Arbeitstitel „SSH-Academy“. Name, Domain und Branding sind frei änderbar.

---

## 1. Ziel und Zielgruppe

Eine moderne Webplattform, die zwei Dinge in einem Produkt vereint:

1. **Lernen (öffentlich, ohne Login):** Absolute Einsteiger verstehen Schritt für Schritt, was SSH-Keys sind, wie man sie erstellt, wo sie hingehören, wie man Server absichert und wie man unter Ubuntu und Debian Benutzer mit sudo-Rechten anlegt. Erklärt so, dass es wirklich jeder versteht, mit Bildern, interaktiven Generatoren und Übungen.
2. **Nutzen (mit Login):** Ein persönlicher bzw. Team-Bereich, in dem man SSH-Keys erzeugt und verwaltet, Server hinzufügt, Keys auf Server verteilt, sich direkt im Browser per SSH verbindet und all das mit Rollen und Gruppen gemeinsam nutzt.

**Zielgruppen**

| Gruppe | Bedarf |
|---|---|
| Einsteiger (Homelab, erster VPS) | Verständliche Anleitungen, Copy-and-paste-Befehle, keine Angst vor dem Terminal |
| Fortgeschrittene / Admins | Key-Verwaltung, Verteilung auf viele Server, Rotation, Audit |
| Kleine Teams / Vereine / Firmen | Gemeinsame Server, Rollen, nachvollziehbar wer wann wo Zugriff hatte |

---

## 2. Funktionsumfang

### 2.1 Öffentlicher Lernbereich

- Kurse in Modulen (siehe Kapitel 3), jede Lektion mit
  - kurzer Erklärung in einfacher Sprache plus „Für Profis“-Aufklapper,
  - Befehlen mit Kopier-Button, getrennt nach **Windows / macOS / Linux** (Tabs, Betriebssystem wird automatisch vorausgewählt),
  - Diagrammen (z. B. wie Public/Private Key bei der Anmeldung zusammenspielen),
  - typischen Fehlern und deren Lösung („Permission denied (publickey)“ usw.),
  - Mini-Quiz am Ende.
- **Interaktive Werkzeuge** (laufen komplett im Browser, nichts geht an den Server):
  - *Key-Generator Demo:* erzeugt Ed25519-Keys per WebCrypto und zeigt, wie Public und Private Key aussehen.
  - *Befehls-Baukasten:* Eingabe von Benutzername, Server-IP, Port, Key-Name, die Seite erzeugt die passenden Befehle (ssh-keygen, ssh-copy-id, ~/.ssh/config-Block, adduser, usermod usw.).
  - *sshd_config-Generator:* Häkchen setzen (Root-Login aus, Passwort-Login aus, Port ...), fertige Drop-in-Datei mit Erklärung jeder Zeile.
  - *Fehler-Doktor:* Fehlermeldung einfügen, passende Erklärung und Lösung erhalten.
  - *Rechte-Checker:* zeigt die korrekten Datei- und Ordnerrechte (700 / 600 / 644) mit Prüfbefehl.
- **Übungsterminal (Playground, Phase 3):** Pro Lernendem ein kurzlebiger, isolierter Linux-Container (Ubuntu oder Debian) im Browser, um Benutzer anzulegen, Keys zu hinterlegen und sshd zu konfigurieren, ohne einen eigenen Server zu brauchen. Wird nach 30 Minuten automatisch gelöscht.
- Lernfortschritt, Abzeichen und Zertifikat „SSH-Grundlagen“ (für eingeloggte Nutzer).
- Suche, Glossar (Begriffe wie Fingerprint, Agent, known_hosts mit Mouseover-Erklärung), Dark Mode, barrierearm (WCAG 2.2 AA).

### 2.2 Login-Bereich (Dashboard)

**Konto und Anmeldung**
- Registrierung per E-Mail mit Bestätigung, optional Login mit GitHub/Google (OAuth).
- **Login mit Pocket ID (OIDC/SSO)**, auch für bereits bestehende Pocket-ID-Konten, ohne erneute Registrierung (Details in Kapitel 6.4).
- **Passkeys (WebAuthn)** als bevorzugte Anmeldung, TOTP als Alternative.
- **2FA ist Pflicht**, sobald ein Nutzer Server anlegt oder Keys im Tresor speichert.
- Sitzungsübersicht (aktive Geräte, abmelden), Kontolöschung inkl. aller Daten (DSGVO).

**SSH-Key-Verwaltung**
- Keys erzeugen: Ed25519 (Standard), RSA 4096 (Kompatibilität), ECDSA; Hinweis auf FIDO2-Keys (`ed25519-sk`) mit Anleitung, da diese nur lokal mit Hardware-Token erzeugt werden können.
- Zwei Modi (wichtigste Sicherheitsentscheidung, siehe Kapitel 5.1):
  - **„Nur herunterladen“** (Standard): Key wird im Browser erzeugt, Private Key wird als Datei heruntergeladen, verlässt nie den Browser. Nur der Public Key wird gespeichert.
  - **„Im Tresor speichern“**: nötig für die Browser-SSH-Funktion. Private Key wird verschlüsselt gespeichert.
- Vorhandene Public Keys importieren (z. B. vom eigenen Rechner), Fingerprint-Anzeige (SHA256), Kommentar, Ablaufdatum.
- Key-Rotation mit Assistent: neuen Key erzeugen, auf alle Server verteilen, alten Key überall entfernen.
- Export als `authorized_keys`-Zeile, `~/.ssh/config`-Block, PuTTY-Format (.ppk) für Windows-Nutzer.

**Server-Verwaltung**
- Server hinzufügen: Name, Host/IP, Port, Login-Benutzer, Betriebssystem (Ubuntu/Debian/Sonstige), Tags, Server-Gruppe.
- **Host-Key-Prüfung:** Beim ersten Verbinden wird der Fingerprint angezeigt und muss bestätigt werden (wie beim echten SSH). Danach wird er gespeichert, Abweichungen blockieren die Verbindung mit deutlicher Warnung.
- Status-Check (erreichbar, SSH-Version, Host-Key unverändert).
- **Key verteilen:** Ausgewählte Public Keys auf einen oder viele Server für einen bestimmten Benutzer eintragen. Die Erstverbindung kann einmalig mit Passwort erfolgen (Passwort wird nie gespeichert). Die Plattform legt `~/.ssh` mit korrekten Rechten an, hängt den Key ohne Duplikate an `authorized_keys` an und prüft danach, ob der Login funktioniert.
- **Key entziehen:** Entfernt einen Key gezielt aus `authorized_keys` auf allen zugewiesenen Servern.
- **Benutzer-Assistent (Ubuntu/Debian):** Neuen Linux-Benutzer anlegen, optional zur sudo-Gruppe hinzufügen, Key hinterlegen, danach optional Root-Login und Passwort-Login abschalten. Jeder Schritt zeigt den ausgeführten Befehl an (Lerneffekt) und verlangt eine Bestätigung. Der Assistent prüft vor dem Abschalten des Passwort-Logins, dass der Key-Login funktioniert, damit man sich nicht aussperrt.
- **Web-Terminal:** SSH-Verbindung direkt im Browser (xterm.js), mehrere Tabs, Copy/Paste, Größenanpassung, Zeitlimit bei Inaktivität.
- Optional (Phase 3): SFTP-Dateibrowser, Snippets (gespeicherte Befehle), Befehl gleichzeitig auf mehreren Servern.

**Teams, Rollen und Gruppen** (Details in Kapitel 6)
- Teams (Organisationen) anlegen, Mitglieder per E-Mail einladen.
- Server und Keys können einem Nutzer persönlich oder einem Team gehören.
- Server-Gruppen (z. B. „Produktion“, „Test“) mit eigenen Zugriffsregeln.
- Zugriffsfreigaben: wer darf auf welche Server-Gruppe mit welchem Linux-Benutzer.

**Audit und Nachvollziehbarkeit**
- Audit-Log: Login, Key erstellt/gelöscht/verteilt/entzogen, Serverzugriff, Rollenänderung, inkl. IP und Zeit. Nicht löschbar für normale Mitglieder.
- Optional pro Team: Aufzeichnung von Terminal-Sitzungen (Asciinema-Format, abspielbar). Standard: aus, mit klarem Hinweis an Nutzer, wenn aktiv.
- Benachrichtigungen per E-Mail bei sicherheitsrelevanten Ereignissen (neuer Key, Host-Key-Änderung, neues Gerät).

### 2.3 Administrationsbereich (Plattform-Admin)

- Nutzer- und Teamverwaltung, Sperren, 2FA zurücksetzen.
- Kursinhalte verwalten (Inhalte liegen als MDX im Repository, siehe 4.2; Admin sieht Statistiken und Feedback).
- Systemeinstellungen: erlaubte Zielnetze für SSH, Limits, Registrierung offen/geschlossen.
- Systemzustand: Gateway-Verbindungen, Fehler, Warteschlangen.

---

## 3. Lerninhalte (Kursgliederung)

**Modul 1: Grundlagen**
1. Was ist SSH? (Fernsteuerung eines Servers, verschlüsselt)
2. Passwort vs. SSH-Key: warum Keys sicherer und bequemer sind
3. Public Key und Private Key einfach erklärt (Schloss-und-Schlüssel-Bild)
4. Was ist ein Fingerprint, was ist `known_hosts`, was bedeutet die Warnung beim ersten Verbinden?

**Modul 2: Keys erstellen**
1. Ed25519, RSA, ECDSA: welcher Typ und warum (Empfehlung Ed25519)
2. `ssh-keygen` unter Linux und macOS
3. Windows: OpenSSH in PowerShell (Standard seit Windows 10), PuTTYgen als Alternative
4. Passphrase: wozu, wie stark, wie ändern (`ssh-keygen -p`)
5. Hardware-Keys (YubiKey, `ed25519-sk`)
6. Wo liegen die Dateien (`~/.ssh/id_ed25519`, `.pub`), richtige Rechte

**Modul 3: Keys auf dem Server hinterlegen**
1. `authorized_keys`: Ort, Format, Rechte (`~/.ssh` 700, Datei 600)
2. `ssh-copy-id` (Linux/macOS) und das Gegenstück für Windows-PowerShell
3. Manuell per Konsole des Hosters (falls kein Passwort-Login möglich)
4. Keys beim Hoster hinterlegen (Hetzner, DigitalOcean, AWS, Netcup usw. als allgemeines Prinzip)
5. Mehrere Keys, Optionen in `authorized_keys` (`from=`, `command=`, `no-port-forwarding`)
6. Keys entfernen und rotieren

**Modul 4: Komfortabel arbeiten**
1. `ssh-agent` und `ssh-add` (Linux, macOS Keychain, Windows-Dienst)
2. `~/.ssh/config`: Hosts mit Kurznamen, Port, User, IdentityFile
3. Agent-Forwarding: wann sinnvoll, warum gefährlich, besser `ProxyJump`
4. Jump-Host / Bastion
5. SSH in VS Code, Git und GitHub mit SSH-Keys

**Modul 5: Benutzer unter Ubuntu und Debian**
1. Warum nicht dauerhaft als root arbeiten
2. `adduser` vs. `useradd` (Unterschiede, Empfehlung `adduser`)
3. sudo-Rechte: `usermod -aG sudo benutzer`, Debian-Besonderheit (sudo ggf. erst installieren: `apt install sudo`)
4. `visudo` und Dateien in `/etc/sudoers.d/`, NOPASSWD: wann ok, wann nicht
5. Key für den neuen Benutzer einrichten (als root: Ordner anlegen, `chown`, `chmod`)
6. Benutzer sperren, löschen, Gruppen verwalten
7. Test: neuer Login funktioniert, erst dann weiter zu Modul 6

**Modul 6: Root-Zugang mit SSH-Keys: Vor- und Nachteile**

| | Root per Key | Eigener Benutzer + sudo |
|---|---|---|
| Vorteile | Einfach, wenige Schritte, für Automatisierung (z. B. Backup) direkt nutzbar | Nachvollziehbar wer was tut, sudo-Log, kein Angriffsziel „root“, Rechte gezielt vergebbar, Fehler mit Vollrechten seltener |
| Nachteile | Bekannter Benutzername als Angriffsziel, kein Audit pro Person, ein geleakter Key gibt sofort Vollzugriff | Mehr Einrichtung, sudo-Passwort nötig (oder bewusst NOPASSWD) |
| Empfehlung | Nur `PermitRootLogin prohibit-password` wenn wirklich nötig, sonst `no` | **Standard für alle Menschen** |

**Modul 7: Server absichern (sshd)**
1. `sshd_config` und Drop-ins in `/etc/ssh/sshd_config.d/` (Ubuntu 22.04+/Debian 12+)
2. Stolperfalle: `50-cloud-init.conf` setzt bei vielen VPS `PasswordAuthentication yes` und überschreibt eigene Einstellungen (erste gefundene Einstellung gewinnt)
3. `PasswordAuthentication no`, `PermitRootLogin`, `AllowUsers` / `AllowGroups`, `KbdInteractiveAuthentication no`
4. Konfiguration testen (`sshd -t`), neu laden und **zweite Sitzung offen lassen**, bevor man sich abmeldet
5. Port ändern: auf Ubuntu 22.10+ und 24.04 über `ssh.socket` (Socket Activation), auf Debian klassisch per `Port`
6. Firewall (`ufw` auf Ubuntu, `nftables`/`ufw` auf Debian), Fail2ban
7. Automatische Sicherheitsupdates (`unattended-upgrades`)

**Modul 8: Fortgeschritten**
1. SSH-Zertifikate (eigene CA statt `authorized_keys` überall)
2. Port-Forwarding und Tunnel
3. Key-Management im Team: Rotation, Offboarding, Audit
4. Typische Fehler und Fehlersuche (`ssh -v`, `journalctl -u ssh`, Rechte, SELinux-Hinweis)

Jedes Modul endet mit einem Quiz und (ab Phase 3) einer praktischen Aufgabe im Übungsterminal, die automatisch geprüft wird (z. B. „Lege Benutzer anna mit sudo-Rechten an und hinterlege diesen Key“).

---

## 4. Architektur und Technik

### 4.1 Gewählter Tech-Stack (Standardentscheidungen)

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache | **TypeScript** durchgängig | Ein Sprachstack für Frontend, Backend und Gateway |
| Web-App | **Next.js 16 (App Router, React 19, Server Components, Server Actions)** | Moderner Standard, SEO für Lerninhalte (statisch generiert), Dashboard dynamisch |
| UI | **Tailwind CSS 4 + shadcn/ui (Radix)**, lucide-Icons | Barrierearm, Dark Mode, schnell anpassbar |
| Inhalte | **MDX** im Repository (Content Collections), Shiki für Syntax-Highlighting | Versioniert, per Pull Request pflegbar, eigene Komponenten (OS-Tabs, Quiz) |
| Datenbank | **PostgreSQL 17** + **Drizzle ORM** | Robust, Migrationen typisiert |
| Auth | **Better Auth** (E-Mail, OAuth, Passkeys, TOTP, Organisationen) + Generic-OIDC für **Pocket ID** | Selbst gehostet, unterstützt Teams und 2FA nativ |
| Cache / Queues | **Redis (Valkey)** + BullMQ | Rate-Limits, Jobs (Key-Verteilung an viele Server), Sitzungsdaten |
| SSH-Gateway | Eigener **Node.js-Dienst mit `ssh2`**, WebSocket-Anbindung | Getrennt von der Web-App (Sicherheitsgrenze, eigene Skalierung, eigenes Netzwerk) |
| Terminal im Browser | **xterm.js** | De-facto-Standard |
| Kryptografie im Browser | **WebCrypto Ed25519** (alle aktuellen Browser) + `sshpk`-kompatible Formatierung im Client | Private Keys entstehen im Browser |
| Schlüsselverschlüsselung | Envelope Encryption, Master-Key aus **KMS / HashiCorp Vault / OpenBao** (Fallback: Datei-Secret) | Siehe 5.1 |
| Playground | Docker bzw. später **Firecracker/gVisor**-Sandboxen | Isolierte Übungsserver |
| Tests | Vitest, Playwright (E2E), Testcontainer mit echtem sshd | Gateway gegen echte Ubuntu- und Debian-Container testen |
| Qualität | ESLint, Prettier, TypeScript strict, Renovate, CodeQL, Trivy | Moderner CI-Standard |
| Deployment | **Docker Compose** (einfach) mit Caddy als Reverse Proxy und automatischem HTTPS; Kubernetes optional später | Selbst hostbar auf einem eigenen Server |
| Monitoring | OpenTelemetry, Prometheus/Grafana oder Sentry | Fehler und Gateway-Auslastung sichtbar |
| i18n | `next-intl`, Deutsch zuerst | Englisch später ohne Umbau |

Repository als **Monorepo** (pnpm Workspaces + Turborepo):

```
ssh-academy/
├─ apps/
│  ├─ web/          Next.js: Lernbereich, Dashboard, Admin, API
│  └─ gateway/      SSH-Gateway (WebSocket <-> SSH), Verteil-Jobs
├─ packages/
│  ├─ db/           Drizzle-Schema, Migrationen
│  ├─ crypto/       Key-Erzeugung, Formate, Envelope Encryption
│  ├─ ui/           gemeinsame Komponenten
│  └─ content/      MDX-Kurse
├─ infra/           docker-compose, Caddyfile, Test-sshd-Container
└─ .github/         CI-Workflows
```

### 4.2 Systemübersicht

```
 Browser ──HTTPS──> Caddy ──> web (Next.js) ──> PostgreSQL
    │                              │  └──────> Redis / BullMQ
    │                              │ kurzlebiges Verbindungs-Token
    └──WSS (Terminal)──> Caddy ──> gateway ──SSH──> Zielserver
                                     │
                                     └─> KMS/Vault (entschlüsselt DEK nur im Speicher)
```

**Ablauf einer Browser-SSH-Sitzung**
1. Nutzer klickt „Verbinden“. Die Web-App prüft Rolle, Freigabe und 2FA-Status und erzeugt ein **einmaliges Verbindungs-Token** (60 Sekunden gültig, an Nutzer, Server, Linux-Benutzer und Key gebunden).
2. Browser öffnet WebSocket zum Gateway mit diesem Token.
3. Gateway prüft Token, lädt den verschlüsselten Private Key, lässt den Datenschlüssel über KMS entschlüsseln, hält den Klartext-Key nur im Arbeitsspeicher und verwirft ihn nach Verbindungsaufbau.
4. Gateway prüft den Host-Key gegen den gespeicherten Fingerprint, baut die Verbindung auf und leitet Terminal-Daten durch.
5. Start, Ende und Dauer landen im Audit-Log, optional die Aufzeichnung.

---

## 5. Sicherheit

Diese Plattform verwaltet Zugänge zu Servern. Sicherheit ist daher die wichtigste Anforderung, nicht ein Zusatz.

### 5.1 Umgang mit Private Keys

| Modus | Wo entsteht der Key | Was speichert die Plattform | Browser-SSH möglich |
|---|---|---|---|
| Nur herunterladen (Standard) | Im Browser | Nur Public Key + Fingerprint | Nein (nur Anleitung, wie man sich lokal verbindet) |
| Tresor | Im Browser | Private Key verschlüsselt | Ja |
| Zertifikate (Phase 4) | Plattform als SSH-CA | Nur CA-Key (im KMS/HSM) | Ja, mit kurzlebigen Zertifikaten |

**Tresor-Verschlüsselung**
- Jeder Key bekommt einen eigenen Datenschlüssel (DEK, AES-256-GCM). Der DEK wird mit einem Master-Key (KEK) im KMS/Vault verschlüsselt. In der Datenbank liegen nur Chiffretext, verschlüsselter DEK, Nonce und Key-Version.
- Nur das **Gateway** darf DEKs entschlüsseln, die Web-App nicht. Ein Einbruch in die Web-App allein gibt keine Keys preis.
- Private Keys werden im Tresor **ohne** Passphrase gespeichert (sonst müsste man sie bei jeder Verbindung eingeben). Option für Nutzer: zusätzliche Passphrase, die bei jedem Verbinden abgefragt wird (dann Ende-zu-Ende: Entschlüsselung im Browser, nur der freigeschaltete Key geht für die Sitzung ans Gateway).
- Export eines Tresor-Keys erfordert erneute 2FA-Bestätigung und wird protokolliert.
- Master-Key-Rotation ohne Neuverschlüsselung aller Keys (nur DEKs neu verpacken).

**Langfristige Empfehlung:** Phase 4 führt eine **SSH-Zertifizierungsstelle** ein. Server vertrauen einmalig der CA (`TrustedUserCAKeys`), die Plattform stellt Zertifikate mit 5 bis 15 Minuten Gültigkeit aus. Dann liegen gar keine langlebigen Private Keys mehr auf der Plattform, und Entzug passiert automatisch. Das ist der Ansatz moderner Werkzeuge wie Teleport oder Smallstep.

### 5.2 Browser-SSH und Gateway

- **SSRF-Schutz:** Ohne Einschränkung könnte jemand das Gateway nutzen, um interne Netze anzugreifen. Standard: private und Sonder-Adressbereiche (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, IPv6-Pendants, Cloud-Metadaten-IPs) sind gesperrt. DNS wird beim Verbinden aufgelöst und die IP geprüft (gegen DNS-Rebinding). Für selbst gehostete Installationen kann der Admin erlaubte Netze freigeben.
- **Missbrauchsschutz:** Limits pro Nutzer (gleichzeitige Sitzungen, Verbindungsversuche pro Minute, Anzahl Server), Gateway hat eigenen ausgehenden Netzwerkpfad, nur Ports, die der Admin erlaubt (Standard: alle, mit Rate-Limit).
- **Host-Key-Pinning** (siehe 2.2), keine Verbindung ohne bestätigten Fingerprint.
- Gateway läuft als unprivilegierter Container, read-only Dateisystem, keine Shell im Image, eigenes Netzwerksegment.
- Terminal-WebSocket nur mit Einmal-Token, Origin-Prüfung, Leerlauf-Timeout (Standard 15 Minuten), maximale Sitzungsdauer (Standard 8 Stunden).
- Passwörter für die Erstverteilung werden nur für die eine Verbindung genutzt, nie gespeichert oder geloggt.

### 5.3 Web-App allgemein

- OWASP ASVS Level 2 als Richtschnur.
- Strikte Content Security Policy mit Nonces, HSTS, `SameSite=Lax`/`Strict`-Cookies, CSRF-Schutz bei Server Actions.
- Passwort-Hashing mit Argon2id, Prüfung gegen bekannte geleakte Passwörter (HIBP k-Anonymity).
- Rate-Limits auf Login, Registrierung, Passwort-Reset.
- Jede Berechtigungsprüfung serverseitig zentral (eine Policy-Funktion, siehe 6.3), keine Prüfung nur im Frontend.
- Sicherheitsrelevante Aktionen (Key exportieren, Rolle ändern, Team löschen) erfordern erneute Bestätigung (Re-Auth).
- Abhängigkeiten automatisch aktualisiert (Renovate) und gescannt; Container-Images signiert.
- Backups der Datenbank verschlüsselt; Master-Key separat gesichert (ohne ihn sind Tresor-Keys unbrauchbar, das ist gewollt).
- Externer Penetrationstest vor öffentlichem Start der SSH-Funktion.

### 5.4 Datenschutz (DSGVO)

- Datensparsamkeit: Lernbereich ohne Konto und ohne Tracking-Cookies nutzbar; Statistik datenschutzfreundlich (z. B. Plausible/Umami, selbst gehostet).
- Impressum, Datenschutzerklärung, Auftragsverarbeitung für Teams.
- Kontolöschung entfernt Keys, Server, Sitzungsaufzeichnungen; Audit-Logs werden nach definierter Frist (Standard 12 Monate) gelöscht oder anonymisiert.
- Hosting in der EU.

---

## 6. Rollen, Gruppen und Berechtigungen

### 6.1 Ebenen

1. **Plattform-Rollen:** `superadmin` (Betreiber), `user` (alle Registrierten).
2. **Team-Rollen** (pro Team/Organisation): `owner`, `admin`, `operator`, `member`, `viewer`.
3. **Zugriffsfreigaben** (fein): Team-Mitglied oder Nutzergruppe X darf auf Server-Gruppe Y als Linux-Benutzer Z zugreifen.

Ein Nutzer kann in mehreren Teams sein und hat zusätzlich seinen persönlichen Bereich, in dem er alles darf.

**Nutzergruppen** innerhalb eines Teams (z. B. „Entwickler“, „Datenbank-Admins“) bündeln Mitglieder, damit Freigaben nicht pro Person gepflegt werden müssen.

### 6.2 Berechtigungsmatrix (Team)

| Aktion | owner | admin | operator | member | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| Team löschen, Besitz übertragen | ✔ | | | | |
| Mitglieder einladen/entfernen, Rollen ändern | ✔ | ✔ | | | |
| Nutzergruppen und Freigaben verwalten | ✔ | ✔ | | | |
| Server anlegen/bearbeiten/löschen | ✔ | ✔ | ✔ | | |
| Team-Keys erzeugen und verteilen/entziehen | ✔ | ✔ | ✔ | | |
| Per Browser-SSH verbinden (laut Freigabe) | ✔ | ✔ | ✔ | ✔ | |
| Eigenen Key für freigegebene Server hinterlegen lassen | ✔ | ✔ | ✔ | ✔ | |
| Server, Keys (nur Public), Status ansehen | ✔ | ✔ | ✔ | ✔ | ✔ |
| Audit-Log ansehen | ✔ | ✔ | | | |
| Sitzungsaufzeichnungen ansehen | ✔ | ✔ | | | |
| Team-Einstellungen (Aufzeichnung, Limits, 2FA-Pflicht) | ✔ | ✔ | | | |

Regeln: Es gibt immer mindestens einen `owner`. Niemand kann sich selbst höher stufen. `member` ohne Freigabe sieht nur Server, für die es eine Freigabe gibt.

### 6.3 Umsetzung

- Rollenbasiert (RBAC) plus Freigaben (ABAC-Anteil: Server-Gruppe, Linux-Benutzer, optional Zeitfenster und Ablaufdatum).
- Eine zentrale Funktion `can(user, action, resource)` im Backend, abgedeckt durch Tests für jede Zeile der Matrix.
- **Offboarding:** Wird jemand aus dem Team entfernt, werden seine persönlichen Keys automatisch von allen Team-Servern entfernt (Job), Ergebnis im Audit-Log.
- **Zeitlich begrenzter Zugriff:** Freigabe mit Ablaufdatum (z. B. externer Dienstleister für 3 Tage).

### 6.4 Anmeldung über Pocket ID (Single Sign-On)

[Pocket ID](https://github.com/pocket-id/pocket-id) ist ein selbst gehosteter OpenID-Connect-Anbieter mit Passkey-Login. Die Plattform bindet ihn als vollwertigen Login-Weg ein.

**Technische Anbindung**
- Standard-OIDC: Authorization Code Flow mit PKCE, Konfiguration automatisch über `https://<pocket-id>/.well-known/openid-configuration`.
- Umsetzung über das Generic-OIDC-Plugin von Better Auth; Scopes `openid profile email groups`.
- Button „Mit Pocket ID anmelden“ auf der Login-Seite, Name und Logo des Anbieters konfigurierbar.
- Einrichtung in Pocket ID: OIDC-Client anlegen, Callback-URL `https://<plattform>/api/auth/callback/pocket-id` eintragen, PKCE aktivieren, optional erlaubte Pocket-ID-Gruppen festlegen. Client-ID und Secret kommen in die Plattform-Konfiguration (Umgebungsvariablen oder Admin-Oberfläche, Secret verschlüsselt gespeichert).
- Mehrere OIDC-Anbieter sind technisch möglich (z. B. später Authentik oder Keycloak), Pocket ID ist der erste und vorkonfigurierte.

**Bestehende Pocket-ID-Konten**
- Wer in Pocket ID bereits ein Konto hat, meldet sich einfach mit Pocket ID an. Beim ersten Login legt die Plattform automatisch ein Konto an (Just-in-Time-Provisionierung) mit Name, E-Mail und Gruppen aus Pocket ID. Keine zweite Registrierung, kein zweites Passwort.
- Das gilt auch, wenn die Registrierung sonst nur per Einladung möglich ist. Der Admin legt fest:
  - *alle* Pocket-ID-Nutzer dürfen sich anmelden, oder
  - nur Mitglieder bestimmter Pocket-ID-Gruppen (z. B. `ssh-academy`), oder
  - nur Nutzer, die vorher eingeladen wurden.
- Das Konto wird dauerhaft über Anbieter + `sub`-Kennung verknüpft, nicht über die E-Mail-Adresse. Ändert jemand in Pocket ID seine E-Mail, bleibt das Konto erhalten.

**Bestehende Plattform-Konten mit Pocket ID verbinden**
- Hat jemand schon ein lokales Konto (E-Mail/Passkey) und meldet sich zum ersten Mal mit Pocket ID an, wird **nicht stillschweigend** anhand der E-Mail verknüpft (Schutz vor Kontoübernahme). Stattdessen: „Es gibt bereits ein Konto mit dieser E-Mail. Melde dich einmal mit deinem bisherigen Zugang an, um Pocket ID zu verbinden.“
- Alternativ in den Kontoeinstellungen: „Pocket ID verbinden“ bzw. „trennen“. Ein Konto muss immer mindestens einen Login-Weg behalten.
- Für Installationen, bei denen Pocket ID die einzige vertrauenswürdige Quelle ist, kann der Admin automatische Verknüpfung über verifizierte E-Mail erlauben (Standard: aus).

**Gruppen und Rollen aus Pocket ID übernehmen**
- Pocket-ID-Gruppen kommen über den `groups`-Claim und lassen sich zuordnen, z. B.:

| Pocket-ID-Gruppe | Plattform |
|---|---|
| `ssh-admins` | Team „Infrastruktur“, Rolle `admin` |
| `entwickler` | Team „Infrastruktur“, Rolle `member`, Nutzergruppe „Entwickler“ |
| `plattform-admins` | Plattform-Rolle `superadmin` (nur wenn ausdrücklich freigeschaltet) |

- Abgleich bei jedem Login: neue Gruppen geben Rechte, entfernte Gruppen nehmen sie wieder weg. Manuell vergebene Rollen bleiben getrennt davon bestehen und sind in der Oberfläche als „manuell“ bzw. „aus Pocket ID“ gekennzeichnet.
- **Offboarding:** Plattform-Sitzungen aus einem Pocket-ID-Login sind standardmäßig höchstens 12 Stunden gültig, danach erfolgt ein erneuter Abgleich mit Pocket ID. Wird ein Nutzer in Pocket ID deaktiviert, verliert er spätestens dann den Zugang; der Admin kann Sitzungen sofort beenden. Optional prüft ein Hintergrund-Job regelmäßig über die Pocket-ID-API (API-Key), ob Nutzer deaktiviert oder aus Gruppen entfernt wurden, und entzieht dann auch die Keys auf den Servern (wie in 6.3).

**2FA-Pflicht**
- Ein Login über Pocket ID erfolgt per Passkey und gilt damit als starke Anmeldung. Die 2FA-Pflicht für Server und Tresor (siehe 2.2) ist damit erfüllt, ohne zusätzliches TOTP.

**Optionen für den Betrieb**
- „Nur Pocket ID“: lokale Registrierung und Passwort-Login abschalten, ideal für Homelab und Firmen mit vorhandenem Pocket ID.
- Pocket ID kann optional im selben Docker-Compose-Setup mitgeliefert werden, für alle, die noch keins haben.

---

## 7. Datenmodell (Kern)

```
users(id, email, name, locale, created_at, ...)            -- Better Auth
sessions, accounts, passkeys, two_factor                    -- Better Auth (accounts speichert provider_id + sub für Pocket ID)
identity_providers(id, slug, display_name, issuer_url, client_id, client_secret_enc,
                   enabled, auto_provision, allowed_groups[], auto_link_by_email,
                   max_session_hours, api_key_enc)
idp_group_mappings(id, provider_id, external_group, org_id, role, user_group_id,
                   platform_role)
organizations(id, name, slug, settings_json, created_at)    -- Teams
memberships(user_id, org_id, role, created_at)
user_groups(id, org_id, name)
user_group_members(group_id, user_id)

ssh_keys(id, owner_type[user|org], owner_id, name, type[ed25519|rsa|ecdsa|sk],
         public_key, fingerprint_sha256, comment, storage_mode[download|vault],
         expires_at, revoked_at, created_by, created_at)
ssh_key_secrets(key_id, ciphertext, nonce, wrapped_dek, kek_version,
                passphrase_protected bool)                  -- getrennte Tabelle, nur Gateway liest

servers(id, owner_type, owner_id, name, host, port, os[ubuntu|debian|other],
        host_key_fingerprint, host_key_confirmed_at, last_check_at, status, created_by)
server_groups(id, org_id, name)
server_group_members(group_id, server_id)

access_grants(id, org_id, subject_type[user|user_group], subject_id,
              target_type[server|server_group], target_id, linux_user,
              valid_from, valid_until, created_by)

key_deployments(id, key_id, server_id, linux_user, status[pending|deployed|removed|failed],
                deployed_at, removed_at, last_error)
connection_sessions(id, user_id, server_id, linux_user, key_id, started_at, ended_at,
                    client_ip, recording_path)
audit_events(id, org_id, actor_id, action, target_type, target_id, ip, user_agent,
             metadata_json, created_at)                    -- append-only

course_progress(user_id, lesson_slug, completed_at, quiz_score)
playground_sessions(id, user_id, image, container_id, expires_at)  -- Phase 3
```

---

## 8. UX und Design

- Ruhiges, modernes Design, große Lesbarkeit, klare Farben für Warnungen (Root-Login, Passwort-Login abschalten).
- Lernpfad als Fortschrittsleiste, jede Lektion 5 bis 10 Minuten.
- „Ich bin auf Windows / Mac / Linux“-Schalter global, merkt sich die Wahl.
- Gefährliche Aktionen mit verständlicher Erklärung *vor* dem Klick („Wenn du das jetzt abschaltest und dein Key nicht funktioniert, kommst du nicht mehr auf den Server. Wir prüfen das vorher für dich.“).
- Dashboard: Übersicht mit Servern (Status-Ampel), Keys (Ablaufwarnungen), letzte Aktivitäten.
- Mobil nutzbar (Lernbereich vollständig, Terminal eingeschränkt).

---

## 9. Roadmap

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **0. Fundament** | Monorepo, CI, Docker Compose, Design-System, Datenbank, Auth mit Passkey/TOTP und **Login über Pocket ID** (inkl. automatischer Anlage bestehender Pocket-ID-Nutzer und Kontoverknüpfung) | Lauffähiges Grundgerüst, Login funktioniert |
| **1. Lernplattform (MVP öffentlich)** | Module 1 bis 7 als MDX, OS-Tabs, Befehls-Baukasten, sshd_config-Generator, Key-Generator-Demo, Quiz, Glossar, Suche | Öffentlich nutzbare Lernseite |
| **2. Persönliches Dashboard** | Keys erzeugen (Download-Modus + Tresor), Server anlegen, Host-Key-Bestätigung, Key verteilen/entziehen, Benutzer-Assistent Ubuntu/Debian, Web-Terminal, Audit-Log | Einzelnutzer können alles selbst machen |
| **3. Teams und Praxis** | Teams, Rollen, Gruppen-Zuordnung aus Pocket ID, API-Abgleich für Offboarding, Nutzer- und Server-Gruppen, Freigaben, Offboarding, Sitzungsaufzeichnung, Übungsterminal mit automatisch geprüften Aufgaben, Fortschritt und Zertifikat, Modul 8 | Gemeinsame Nutzung, praktisches Üben |
| **4. Profi-Funktionen** | SSH-CA mit kurzlebigen Zertifikaten, SFTP, Befehle auf mehreren Servern, API-Tokens, Englisch, Penetrationstest | Produktionsreife für Firmen |

Jede Phase endet mit Tests (Unit, E2E, Gateway gegen echte Ubuntu 24.04- und Debian 12/13-Container) und einem Deployment auf einer Testumgebung.

---

## 10. Getroffene Standardannahmen (änderbar)

1. Selbst gehostet per Docker Compose auf einem eigenen Linux-Server (kein Vendor-Lock-in), Hosting in der EU.
2. Deutsch als erste Sprache, Englisch vorbereitet.
3. Kostenlos und ohne Bezahlfunktion; Abo-Modell ist später möglich, aber nicht eingeplant.
4. Private Keys standardmäßig **nicht** auf der Plattform gespeichert; Tresor nur auf ausdrücklichen Wunsch und mit Pflicht-2FA.
5. Browser-SSH zu privaten IP-Bereichen standardmäßig gesperrt (umschaltbar für eigene Installationen im Heimnetz).
6. Unterstützte Zielsysteme im Assistenten: Ubuntu 22.04/24.04 und Debian 12/13; andere Systeme per Terminal nutzbar, aber ohne Assistent.
7. Sitzungsaufzeichnung standardmäßig aus.
8. Pocket ID ist als Login-Anbieter eingebaut; bestehende Pocket-ID-Nutzer bekommen beim ersten Login automatisch ein Konto, Verknüpfung mit vorhandenen lokalen Konten nur nach Bestätigung.

## 11. Offene Fragen

1. In welchem GitHub-Repository soll umgesetzt werden (neues Repo, Name)?
2. Soll die Plattform öffentlich für alle sein oder nur für dich bzw. ein eingeladenes Team (Registrierung offen oder per Einladung)?
3. Gibt es einen Wunschnamen und eine Domain?
4. Läuft bei dir schon eine Pocket-ID-Instanz (URL), und soll sie der einzige Login-Weg sein oder zusätzlich zu E-Mail/Passkey?
5. Soll das Übungsterminal (Playground) mit echten Containern kommen? Es braucht mehr Server-Ressourcen und zusätzliche Absicherung.
