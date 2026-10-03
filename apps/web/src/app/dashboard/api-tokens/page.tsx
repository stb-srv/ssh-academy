import type { Metadata } from "next";
import { desc, eq, schema } from "@ssh-academy/db";
import { ApiTokenForm } from "@/components/dashboard/api-token-form";
import { CodeBlock } from "@/components/lernen/code-block";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { API_SCOPES } from "@/lib/api-tokens";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { revokeApiToken } from "./actions";

export const metadata: Metadata = { title: "API-Tokens" };

export default async function ApiTokensPage() {
  const session = await requireSession();
  const tokens = await db.select().from(schema.apiToken).where(eq(schema.apiToken.userId, session.user.id)).orderBy(desc(schema.apiToken.createdAt));
  const now = new Date();
  const base = env.APP_URL.replace(/\/$/, "");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">API-Tokens</h1>
      <p className="text-sm text-muted">
        Mit einem Token greifen Skripte auf deine Daten zu, zum Beispiel um sich vor dem Login ein kurzlebiges Zertifikat zu holen. Ein Token hat
        höchstens deine Rechte, oft weniger. Gespeichert wird nur ein Hash; geht ein Token verloren, widerrufe es.
      </p>
      <Card>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Tokens.</p>
        ) : (
          <ul className="divide-y divide-border">
            {tokens.map((t) => {
              const state = t.revokedAt ? "widerrufen" : t.expiresAt && t.expiresAt <= now ? "abgelaufen" : null;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {t.name} <code className="font-mono text-xs text-muted">{t.prefix}…</code>
                    </p>
                    <p className="text-xs text-muted">
                      {t.scopes.join(", ")} · erstellt {formatDate(t.createdAt)} · {t.expiresAt ? `läuft ab ${formatDate(t.expiresAt)}` : "unbegrenzt"} ·{" "}
                      {t.lastUsedAt ? `zuletzt genutzt ${formatDateTime(t.lastUsedAt)}` : "nie genutzt"}
                    </p>
                  </div>
                  {state ? (
                    <Badge>{state}</Badge>
                  ) : (
                    <ActionButton variant="ghost" confirm={`Token „${t.name}“ widerrufen? Skripte, die es nutzen, funktionieren danach nicht mehr.`} action={revokeApiToken.bind(null, t.id)}>
                      Widerrufen
                    </ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <ApiTokenForm scopes={API_SCOPES} baseUrl={base} />
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Schnittstelle</h2>
        <ul className="list-inside list-disc space-y-1 text-muted">
          <li>
            <code className="font-mono">GET /api/v1/me</code>: dein Konto (jedes Token)
          </li>
          <li>
            <code className="font-mono">GET /api/v1/keys</code>: deine und eure Team-Keys (keys:read)
          </li>
          <li>
            <code className="font-mono">GET /api/v1/servers</code>: Server, auf die du Zugriff hast (servers:read)
          </li>
          <li>
            <code className="font-mono">GET /api/v1/audit?limit=100</code>: dein Protokoll (audit:read)
          </li>
          <li>
            <code className="font-mono">POST /api/v1/certificates</code>: Zertifikat ausstellen (certificates:issue)
          </li>
        </ul>
        <p className="text-muted">Zertifikat für den eigenen Key holen und direkt nutzen:</p>
        <CodeBlock>{`curl -s -X POST ${base}/api/v1/certificates \\
  -H "Authorization: Bearer $SSH_ACADEMY_TOKEN" -H "Content-Type: application/json" \\
  -d "{\\"caId\\": \\"<ID der Stelle>\\", \\"principals\\": [\\"deploy\\"], \\"minutes\\": 60, \\"publicKey\\": \\"$(cat ~/.ssh/id_ed25519.pub)\\"}" \\
  | jq -r .certificate > ~/.ssh/id_ed25519-cert.pub`}</CodeBlock>
      </Card>
    </div>
  );
}
