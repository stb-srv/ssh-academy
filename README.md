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
| 1. Lernplattform | Lektionen als MDX, Befehls-Baukasten, sshd_config-Generator, Quiz | geplant |
| 2. Dashboard | Keys erzeugen und verteilen, Server, Host-Key-Prüfung, Benutzer-Assistent, Web-Terminal | geplant |
| 3. Teams und Praxis | Rollen, Nutzer- und Server-Gruppen, Freigaben, Übungsterminal | geplant |
| 4. Profi | SSH-Zertifikate, SFTP, API | geplant |

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
nano .env              # APP_URL, SITE_ADDRESS usw. anpassen
docker compose up -d --build
```

Danach `APP_URL` im Browser öffnen und unter **Registrieren** das erste Konto anlegen. Der erste Nutzer
wird automatisch Administrator. Ist `REGISTRATION_MODE=closed` gesetzt (Standard), können sich danach nur
noch Pocket-ID-Nutzer selbst anmelden.

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

Nützliche Befehle:

| Befehl | Zweck |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | Prüfen und bauen (über Turborepo) |
| `pnpm db:generate` | Migration aus Schema-Änderungen erzeugen (`packages/db/src/schema`) |
| `pnpm db:migrate` | Migrationen ausführen |

Projektstruktur:

```
apps/web        Next.js 16: Lernbereich, Dashboard, Admin, Auth-API
packages/db     Drizzle-Schema, Migrationen, Datenbank-Client
infra/          Caddyfile
docs/           Konzept und Anleitungen
```
