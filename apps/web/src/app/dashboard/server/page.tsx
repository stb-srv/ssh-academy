import type { Metadata } from "next";
import Link from "next/link";
import { ServerStatusBadge } from "@/components/server/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listAccessibleServers } from "@/lib/access";
import { gatewayEnabled } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { TEAM_ROLE_LABELS } from "@/lib/permissions";
import { getSecurityOverview } from "@/lib/security";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Server" };

export default async function ServersPage() {
  const session = await requireSession();
  const [servers, security] = await Promise.all([listAccessibleServers(session.user.id), getSecurityOverview(session.user.id)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Server</h1>
        {security.strongAuth && gatewayEnabled && <ButtonLink href="/dashboard/server/neu">Server hinzufügen</ButtonLink>}
      </div>
      {!gatewayEnabled && <Alert tone="warning">Das SSH-Gateway ist nicht eingerichtet. Server-Funktionen sind deshalb abgeschaltet.</Alert>}
      {!security.strongAuth && (
        <Alert tone="warning">
          Um Server zu verwalten, brauchst du einen Passkey oder die Zwei-Faktor-Anmeldung.{" "}
          <Link href="/dashboard/sicherheit" className="font-medium underline">
            Jetzt einrichten
          </Link>
        </Alert>
      )}
      {servers.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Noch keine Server. Füge deinen ersten Server hinzu; die Plattform zeigt dir dann seinen Fingerprint zur Bestätigung.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {servers.map(({ server, role, teamName, linuxUsers }) => (
            <li key={server.id}>
              <Link href={`/dashboard/server/${server.id}`} className="block rounded-xl border border-border bg-card p-4 hover:border-primary">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{server.name}</span>
                  <ServerStatusBadge status={server.status} confirmed={Boolean(server.hostKeyConfirmedAt)} />
                  {teamName && <Badge>Team {teamName}</Badge>}
                  {role !== "personal" && <Badge>{TEAM_ROLE_LABELS[role]}</Badge>}
                  {server.tags.map((t) => (
                    <Badge key={t}>#{t}</Badge>
                  ))}
                </div>
                <p className="mt-1 font-mono text-xs text-muted">
                  {server.host}:{server.port} · {server.osVersion ?? "System unbekannt"} · geprüft {formatDateTime(server.lastCheckAt)}
                  {Array.isArray(linuxUsers) && linuxUsers.length > 0 && ` · Freigabe als ${linuxUsers.join(", ")}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
