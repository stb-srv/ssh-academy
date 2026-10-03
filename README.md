# SSH-Academy

Lernplattform und Werkzeug rund um SSH-Keys: Einsteiger lernen Schritt für Schritt, wie sie SSH-Keys
erstellen, auf Servern hinterlegen und Ubuntu- bzw. Debian-Server sicher einrichten. Im Login-Bereich
werden Keys und Server verwaltet, allein oder im Team mit Rollen und Gruppen. Anmeldung per Passwort,
Passkey, Zwei-Faktor-App oder **Pocket ID** (auch mit bestehenden Pocket-ID-Konten).

Das vollständige Konzept steht in [`docs/projektkonzept.md`](docs/projektkonzept.md).

## Stand

| Phase | Inhalt | Status |
|---|---|---|
| 0. Fundament | Monorepo, Datenbank, Login (Passwort, Passkey, TOTP, Pocket ID), Teams-Grundlage, Admin, Docker | ✅ |
| 1. Lernplattform | 8 Module mit Lektionen und Quiz, Werkzeuge (Key-Generator, Befehls-Baukasten, sshd_config-Generator, Fehler-Doktor, Rechte-Prüfer), Glossar | ✅ |
| 2. Dashboard | Keys erzeugen (im Browser), Tresor, Import, Rotation; Server mit Host-Key-Prüfung, Keys verteilen und entziehen, Benutzer-Assistent, Web-Terminal, Protokoll | ✅ |
| 3. Teams und Praxis | Rollen, Einladungen, Nutzer- und Server-Gruppen, befristete Freigaben, Offboarding, Pocket-ID-API-Abgleich, Sitzungsaufzeichnung mit Player, Übungsterminal mit geprüften Aufgaben | ✅ |
| 4. Profi | SSH-Zertifizierungsstelle mit kurzlebigen Zertifikaten, Dateibrowser (SFTP), Befehl auf mehreren Servern, API-Tokens und REST-API | ✅ (ohne Englisch und externen Penetrationstest) |

## Installation (Docker)

Voraussetzung: ein Linux-Server mit Docker und Docker Compose. Für Proxmox gibt es eine
Schritt-für-Schritt-Anleitung: [`docs/proxmox.md`](docs/proxmox.md).

```bash
git clone https://github.com/stb-srv/ssh-academy.git
cd ssh-academy
cp .env.example .env
# Geheimnisse erzeugen und in .env eintragen
openssl rand -hex 32   # -> BETTER_AUTH_SECRET
openssl rand -hex 24   # -> POSTGRES_PASSWORD
openssl rand -hex 32   # -> GATEWAY_INTERNAL_TOKEN
nano .env              # APP_URL, SITE_ADDRESS usw. anpassen
docker compose up -d --build
```

Danach `APP_URL` im Browser öffnen und unter **Registrieren** das erste Konto anlegen. Der erste Nutzer
wird automatisch Administrator. Ist `REGISTRATION_MODE=closed` gesetzt (Standard), können sich danach nur
noch Pocket-ID-Nutzer selbst anmelden.

**Sicherung:** Neben der Datenbank und `.env` muss das Volume `gateway-data` gesichert werden. Darin liegt
der Tresor-Schlüssel (`vault-keys.json`), ohne den gespeicherte Private Keys nicht mehr nutzbar sind.
Details in [`docs/proxmox.md`](docs/proxmox.md#betrieb).

**Server im Heimnetz:** Das SSH-Gateway verbindet sich nur mit öffentlichen Adressen, außer die Netze sind in
`SSH_ALLOWED_NETWORKS` freigegeben (z. B. `192.168.1.0/24`).

**Wichtig für Passkeys:** Passkeys funktionieren nur über HTTPS mit einem Domainnamen (nicht mit einer
nackten IP-Adresse). `APP_URL` muss exakt der Adresse entsprechen, die im Browser steht.

Updates einspielen:

```bash
git pull
docker compose up -d --build
```

Die Datenbank-Migrationen laufen bei jedem Start automatisch.

## Pocket ID

Anleitung zur Einrichtung inklusive Gruppen-Zuordnung: [`docs/pocket-id.md`](docs/pocket-id.md).

## Entwicklung

Voraussetzungen: Node.js 22, pnpm 10, PostgreSQL 16 oder neuer.

```bash
pnpm install
cp .env.example apps/web/.env.local   # DATABASE_URL, BETTER_AUTH_SECRET, APP_URL=http://localhost:3000
pnpm db:migrate                       # braucht DATABASE_URL in der Umgebung
pnpm dev
```

Für Terminal, Tresor und Zertifikate läuft zusätzlich das Gateway (Port 4100, damit es nicht mit anderen
Diensten kollidiert):

```bash
pnpm --filter @ssh-academy/gateway build
GATEWAY_PORT=4100 GATEWAY_DATA_DIR=./.gateway-data GATEWAY_INTERNAL_TOKEN=<32+ Zeichen> \
  DATABASE_URL=... APP_URL=http://localhost:3000 SSH_ALLOWED_NETWORKS=127.0.0.0/8 \
  node apps/gateway/dist/server.mjs
# in apps/web/.env.local: GATEWAY_INTERNAL_URL=http://localhost:4100, GATEWAY_INTERNAL_TOKEN=<dasselbe>,
# GATEWAY_PUBLIC_URL=ws://localhost:4100/ws
```

Nützliche Befehle:

| Befehl | Zweck |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` | Prüfen, testen und bauen (über Turborepo) |
| `pnpm db:generate` | Migration aus Schema-Änderungen erzeugen (`packages/db/src/schema`) |
| `pnpm db:migrate` | Migrationen ausführen |

Projektstruktur:

```
apps/web        Next.js 16: Lernbereich, Dashboard, Admin, Auth-API, REST-API (/api/v1)
apps/gateway    SSH-Gateway: Web-Terminal, SFTP, Server-Aktionen, Tresor, Zertifizierungsstelle
packages/db     Drizzle-Schema, Migrationen, Datenbank-Client
packages/ssh    SSH-Keys, Zertifikate, Tresor-Format, Server-Skripte, Netzprüfung (Browser und Node)
infra/          Caddyfile
docs/           Konzept und Anleitungen
```
