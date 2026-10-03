import type { Metadata } from "next";
import Link from "next/link";
import { AuditList } from "@/components/dashboard/audit-list";
import { ServerStatusBadge } from "@/components/server/status-badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listAccessibleKeys, listAccessibleServers } from "@/lib/access";
import { loadAudit, personalAudit } from "@/lib/audit-query";
import { formatDate, nowMs } from "@/lib/format";
import { getProgress } from "@/lib/progress";
import { getSecurityOverview } from "@/lib/security";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const [security, keys, servers, activity, progress] = await Promise.all([
    getSecurityOverview(session.user.id),
    listAccessibleKeys(session.user.id),
    listAccessibleServers(session.user.id),
    loadAudit(personalAudit(session.user.id), 6),
    getProgress(session.user.id),
  ]);
  const soon = nowMs() + 14 * 86400_000;
  const expiring = keys.filter(({ key }) => !key.revokedAt && key.expiresAt && key.expiresAt.getTime() < soon);
  const problems = servers.filter(({ server }) => server.status === "host_key_mismatch" || server.status === "offline" || !server.hostKeyConfirmedAt);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Hallo {session.user.name.split(" ")[0]}</h1>

      {!security.strongAuth && (
        <Alert tone="warning">
          Richte einen Passkey oder die Zwei-Faktor-Anmeldung ein. Ohne sie kannst du keine Server verwalten und keine Keys im
          Tresor speichern.{" "}
          <Link href="/dashboard/sicherheit" className="font-medium underline">
            Jetzt einrichten
          </Link>
        </Alert>
      )}
      {expiring.map(({ key }) => (
        <Alert key={key.id} tone="warning">
          Der Key „{key.name}“ läuft am {formatDate(key.expiresAt)} ab.{" "}
          <Link href={`/dashboard/keys/${key.id}`} className="font-medium underline">
            Jetzt rotieren
          </Link>
        </Alert>
      ))}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="SSH-Keys" value={keys.filter(({ key }) => !key.revokedAt).length} href="/dashboard/keys" />
        <Stat label="Server" value={servers.length} href="/dashboard/server" />
        <Stat label="Lernfortschritt" value={`${Math.round((progress.lessonsDone / progress.lessonsTotal) * 100)} %`} href="/lernen" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Server</h2>
            <Link href="/dashboard/server" className="text-sm text-primary hover:underline">
              Alle
            </Link>
          </div>
          {servers.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">Noch keine Server. So fängst du an: Key erzeugen, Server hinzufügen, Key eintragen.</p>
              <div className="flex gap-2">
                <ButtonLink href="/dashboard/keys/neu" variant="secondary">
                  Key erzeugen
                </ButtonLink>
                <ButtonLink href="/dashboard/server/neu" variant="secondary">
                  Server hinzufügen
                </ButtonLink>
              </div>
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {(problems.length ? problems : servers).slice(0, 6).map(({ server }) => (
                <li key={server.id} className="flex items-center justify-between gap-2">
                  <Link href={`/dashboard/server/${server.id}`} className="truncate hover:underline">
                    {server.name}
                  </Link>
                  <ServerStatusBadge status={server.status} confirmed={Boolean(server.hostKeyConfirmedAt)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Letzte Aktivität</h2>
            <Link href="/dashboard/aktivitaet" className="text-sm text-primary hover:underline">
              Alle
            </Link>
          </div>
          <AuditList rows={activity} />
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href}>
      <Card className="p-4 hover:border-primary">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </Card>
    </Link>
  );
}
