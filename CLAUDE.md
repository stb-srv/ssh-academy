# SSH-Academy

Lernplattform und Werkzeug für SSH-Keys. Konzept: `docs/projektkonzept.md`. Oberfläche, Texte und Doku auf Deutsch.

- Monorepo mit pnpm + Turborepo. `apps/web` (Next.js 16, App Router), `apps/gateway` (SSH-Gateway, ssh2 + ws, mit esbuild gebündelt), `packages/db` (Drizzle, Postgres), `packages/ssh` (Keys, Zertifikate, Tresor-Format, Server-Skripte; läuft im Browser und in Node).
- Nur das Gateway baut SSH-Verbindungen auf und entschlüsselt Tresor-Keys (`/data/vault-keys.json`). Die Web-App spricht es über die interne HTTP-API (Bearer `GATEWAY_INTERNAL_TOKEN`) an; Browser-Verbindungen laufen über `/gateway/ws` mit Einmal-Token aus `connection_session`.
- Server-Aktionen sind POSIX-sh-Skripte in `packages/ssh/src/ops.ts`; sie werden in der Oberfläche angezeigt, also lesbar halten.
- Next.js 16 weicht von älteren Versionen ab (z. B. `proxy.ts` statt Middleware). Vor Änderungen die Doku unter `apps/web/node_modules/next/dist/docs/` lesen.
- Auth: Better Auth (`apps/web/src/lib/auth.ts`). `packages/db/src/schema/auth.ts` wird mit der Better-Auth-CLI (`pnpm dlx auth generate`) erzeugt; eigene Tabellen gehören in `schema/app.ts`.
- Schema ändern: `pnpm db:generate` erzeugt die Migration, CI prüft, dass Schema und Migrationen übereinstimmen.
- Berechtigungen zentral in `apps/web/src/lib/permissions.ts`; jede Prüfung serverseitig.
- Konfiguration nur über `apps/web/src/lib/env.ts` (zod-validiert), neue Variablen auch in `.env.example` dokumentieren.
- Vor dem Push: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- Der Nutzer möchte wenige, große Pull Requests statt vieler kleiner.
