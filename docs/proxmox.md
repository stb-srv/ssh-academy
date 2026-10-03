# Installation auf Proxmox

Diese Anleitung richtet die SSH-Academy in einem **LXC-Container** mit Docker ein. Eine VM funktioniert
genauso (dann entfällt Schritt 2).

## 1. Container anlegen

In der Proxmox-Oberfläche **Create CT**:

| Einstellung | Wert |
|---|---|
| Template | Debian 12 oder 13 (`debian-12-standard` / `debian-13-standard`) |
| Unprivileged container | ja |
| Disk | 16 GB |
| CPU | 2 Kerne |
| RAM | 2048 MB (Build braucht kurzzeitig mehr; 1024 MB reichen im Betrieb) |
| Netzwerk | DHCP oder feste IP, z. B. `192.168.1.50/24` |

Den Container noch **nicht** starten.

## 2. Docker im LXC erlauben

Unter **Options → Features** die Häkchen bei **nesting** und **keyctl** setzen. Alternativ auf dem
Proxmox-Host:

```bash
pct set <CT-ID> --features nesting=1,keyctl=1
```

Jetzt den Container starten und die Konsole öffnen.

## 3. Docker installieren

```bash
apt update && apt full-upgrade -y
apt install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker run --rm hello-world
```

## 4. SSH-Academy installieren

```bash
cd /opt
git clone https://github.com/stb-srv/ssh-academy.git
cd ssh-academy
cp .env.example .env
sed -i "s/^BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
sed -i "s/^GATEWAY_INTERNAL_TOKEN=.*/GATEWAY_INTERNAL_TOKEN=$(openssl rand -hex 32)/" .env
nano .env
```

In `.env` je nach Variante anpassen:

### Variante A: Öffentliche Domain mit Let's Encrypt

Die Domain (z. B. `ssh.example.de`) zeigt auf deine öffentliche IP, Port 80 und 443 werden im Router an
den Container weitergeleitet.

```env
APP_URL=https://ssh.example.de
SITE_ADDRESS=ssh.example.de
```

### Variante B: Hinter einem vorhandenen Reverse Proxy (Nginx Proxy Manager, Traefik, ...)

Der vorhandene Proxy kümmert sich um HTTPS und leitet auf `http://<Container-IP>:8080` weiter.

```env
APP_URL=https://ssh.example.de
SITE_ADDRESS=:80
HTTP_PORT=8080
HTTPS_PORT=8443
```

Im Proxy **Websockets erlauben**: Web-Terminal und Dateibrowser laufen über `/gateway/ws`.

### Variante C: Nur im Heimnetz

Ein lokaler DNS-Name (z. B. `ssh.home.lan` über Pi-hole, AdGuard oder den Router) zeigt auf die
Container-IP. Caddy stellt ein eigenes Zertifikat aus.

```env
APP_URL=https://ssh.home.lan
SITE_ADDRESS=ssh.home.lan
CADDY_GLOBAL_OPTIONS=local_certs
```

Damit der Browser dem Zertifikat vertraut, das Wurzelzertifikat von Caddy einmalig auf deinen Geräten
importieren:

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

Eine nackte IP-Adresse als `APP_URL` funktioniert zwar, aber **ohne Passkeys** (Browser erlauben
Passkeys nur für Domainnamen).

### Server im Heimnetz verwalten

Das SSH-Gateway verbindet sich zum Schutz vor Missbrauch standardmäßig nur mit öffentlichen Adressen.
Sollen Server im eigenen Netz (z. B. andere Proxmox-Container) verwaltet werden, diese Netze freigeben:

```env
SSH_ALLOWED_NETWORKS=192.168.1.0/24
```

## 5. Starten

```bash
docker compose up -d --build
docker compose ps
```

Alle Dienste sollten `running` bzw. `healthy` sein, `migrate` endet mit `Exited (0)`. Dann `APP_URL` im
Browser öffnen, **Registrieren** wählen und das erste Konto anlegen (wird Administrator).

Ohne SMTP-Server stehen E-Mails im Log:

```bash
docker compose logs web | grep -A4 "\[mail\]"
```

## Betrieb

| Aufgabe | Befehl |
|---|---|
| Update | `cd /opt/ssh-academy && git pull && docker compose up -d --build` |
| Logs | `docker compose logs -f web gateway` |
| Datenbank sichern | `docker compose exec db pg_dump -U ssh_academy ssh_academy > backup.sql` |
| Datenbank zurückspielen | `docker compose exec -T db psql -U ssh_academy ssh_academy < backup.sql` |
| Tresor-Schlüssel sichern | `docker compose cp gateway:/data/vault-keys.json ./vault-keys.json` |

Zusätzlich empfiehlt sich ein regelmäßiges Proxmox-Backup des Containers (vzdump). Die Datei `.env`
enthält `BETTER_AUTH_SECRET`; ohne sie sind gespeicherte Pocket-ID-Tokens und 2FA-Daten nicht mehr
lesbar. Sichere sie getrennt.

**Der Tresor-Schlüssel ist genauso wichtig:** Im Volume `gateway-data` liegt `vault-keys.json`. Nur damit
lassen sich die im Tresor gespeicherten Private Keys und die Zertifizierungsstellen entschlüsseln. Geht die
Datei verloren, sind alle Tresor-Keys unbrauchbar (die Public Keys auf den Servern bleiben, du kommst mit
eigenen Keys weiter drauf). Sichere sie getrennt von der Datenbank, zum Beispiel verschlüsselt im
Passwort-Manager.
