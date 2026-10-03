# Anmeldung mit Pocket ID

[Pocket ID](https://github.com/pocket-id/pocket-id) ist ein selbst gehosteter OpenID-Connect-Anbieter
mit Passkey-Login. Wer dort bereits ein Konto hat, kann sich damit direkt bei der SSH-Academy anmelden.

## 1. OIDC-Client in Pocket ID anlegen

In Pocket ID als Admin: **OIDC Clients → Add OIDC Client**

| Feld | Wert |
|---|---|
| Name | SSH-Academy |
| Callback URLs | `https://<deine-ssh-academy>/api/auth/callback/pocket-id` |
| Public Client | nein |
| PKCE | ja |
| Allowed User Groups | optional, z. B. nur `ssh-academy` |

Nach dem Speichern **Client ID** und **Client Secret** kopieren.

## 2. SSH-Academy konfigurieren

In `.env`:

```env
POCKET_ID_URL=https://id.example.de
POCKET_ID_CLIENT_ID=<Client ID>
POCKET_ID_CLIENT_SECRET=<Client Secret>
```

Danach `docker compose up -d`. Auf der Login-Seite erscheint **Mit Pocket ID anmelden**.

## Wie bestehende Konten behandelt werden

| Situation | Verhalten |
|---|---|
| Pocket-ID-Nutzer meldet sich zum ersten Mal an | Konto wird automatisch angelegt (abschaltbar mit `POCKET_ID_AUTO_PROVISION=false`) |
| Es gibt schon ein lokales Konto mit derselben E-Mail | Keine automatische Verknüpfung (Schutz vor Kontoübernahme). Der Nutzer meldet sich einmal wie bisher an und klickt unter **Dashboard → Sicherheit** auf „Pocket ID verbinden“. |
| Danach | Anmeldung wahlweise über Pocket ID oder den bisherigen Weg |
| E-Mail ändert sich in Pocket ID | Konto bleibt verbunden, weil die Verknüpfung über die Pocket-ID-Kennung (`sub`) läuft |

Wenn Pocket ID die einzige vertrauenswürdige Quelle ist, kann die automatische Verknüpfung über die
bestätigte E-Mail-Adresse erlaubt werden: `POCKET_ID_AUTO_LINK_BY_EMAIL=true`. Das lokale Konto muss
dann eine bestätigte E-Mail haben.

Nur Pocket ID als Login (kein Passwort-Login mehr): `LOCAL_LOGIN_ENABLED=false`.

## Zugriff auf Gruppen beschränken

`POCKET_ID_ALLOWED_GROUPS=ssh-academy,admins` lässt nur Mitglieder dieser Pocket-ID-Gruppen herein.
Andere sehen eine verständliche Meldung auf der Login-Seite. Die gleiche Einschränkung kann zusätzlich in
Pocket ID selbst über **Allowed User Groups** gesetzt werden.

## Gruppen automatisch Teams und Rollen zuordnen

Unter **Admin → Pocket ID** lassen sich Pocket-ID-Gruppen zuordnen, z. B.

| Pocket-ID-Gruppe | Ziel |
|---|---|
| `ssh-admins` | Team „Infrastruktur“, Rolle Admin |
| `entwickler` | Team „Infrastruktur“, Rolle Mitglied |
| `plattform-admins` | Plattform-Administrator |

Der Abgleich passiert bei jedem Login über Pocket ID:

- Neue Gruppe in Pocket ID: die Rolle wird vergeben (bei mehreren Zuordnungen für dasselbe Team gilt die
  höchste Rolle).
- Gruppe in Pocket ID entfernt: die Rolle wird wieder entzogen.
- Manuell vergebene Team-Mitgliedschaften werden nie verändert.

## Sitzungsdauer

Sitzungen aus einem Pocket-ID-Login gelten höchstens `POCKET_ID_MAX_SESSION_HOURS` Stunden (Standard 12)
ab dem Login. Danach ist ein neuer Login über Pocket ID nötig. So verliert ein in Pocket ID deaktivierter
Nutzer spätestens nach dieser Zeit den Zugang, und die Gruppen werden regelmäßig neu abgeglichen.

Ein Login über Pocket ID erfolgt per Passkey und zählt deshalb als starke Anmeldung (wird für Server, den
Key-Tresor und Zertifikate vorausgesetzt).

## Sofortiges Offboarding über die Pocket-ID-API (empfohlen)

Ohne weitere Einstellung merkt die Plattform eine Sperre in Pocket ID erst beim nächsten Login. Mit einem
API-Key gleicht sie regelmäßig (Standard: alle 60 Minuten) alle verknüpften Konten ab:

1. In Pocket ID unter **Einstellungen > API-Keys** einen Key anlegen.
2. In `.env` eintragen und neu starten:

   ```env
   POCKET_ID_API_KEY=...
   POCKET_ID_SYNC_MINUTES=60
   ```

Bei jedem Abgleich gilt:

- Nutzer in Pocket ID **deaktiviert oder gelöscht**: Das Konto wird gesperrt, alle Sitzungen beendet,
  laufende Terminal-Verbindungen getrennt (spätestens nach 30 Sekunden), und der Nutzer wird aus allen Teams
  entfernt. Dabei werden seine persönlichen Keys von allen Team-Servern entfernt (Offboarding).
- Nutzer wieder aktiviert: Die vom Abgleich gesetzte Sperre wird aufgehoben. Team-Mitgliedschaften kommen
  über die Gruppen-Zuordnung beim nächsten Abgleich zurück.
- Gruppen geändert: Team-Rollen werden wie beim Login angepasst, ohne dass sich der Nutzer neu anmelden muss.

Liefert die API keine Nutzer (z. B. falscher Key), bricht der Abgleich ab, statt alle zu sperren.
