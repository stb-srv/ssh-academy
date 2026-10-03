import type { Metadata } from "next";
import { MultiCommand } from "@/components/server/multi-command";
import { Card } from "@/components/ui/card";
import { listAccessibleServers } from "@/lib/access";
import { gatewayEnabled } from "@/lib/env";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Mehrfach-Befehl" };

export default async function MultiCommandPage() {
  const session = await requireSession();
  const servers = (await listAccessibleServers(session.user.id)).filter((a) => a.canManage);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Befehl auf mehreren Servern</h1>
      <p className="text-sm text-muted">
        Führt einen Befehl auf allen gewählten Servern aus (bis zu fünf gleichzeitig), angemeldet mit dem Verwaltungs-Key des jeweiligen Servers. Jeder Aufruf steht im
        Protokoll. Interaktive Programme (Editoren, Rückfragen) funktionieren hier nicht; nutze dafür das Terminal.
      </p>
      {!gatewayEnabled ? (
        <Card>
          <p className="text-sm text-muted">Diese Funktion braucht das SSH-Gateway.</p>
        </Card>
      ) : servers.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Du verwaltest noch keine Server.</p>
        </Card>
      ) : (
        <MultiCommand
          servers={servers.map(({ server, teamName }) => ({
            id: server.id,
            name: server.name,
            host: server.host,
            group: teamName ? `Team ${teamName}` : "Persönlich",
            loginUser: server.defaultUser,
            ready: Boolean(server.hostKeyConfirmedAt && server.managementKeyId),
            reason: !server.hostKeyConfirmedAt ? "Fingerprint nicht bestätigt" : !server.managementKeyId ? "kein Verwaltungs-Key" : undefined,
          }))}
        />
      )}
    </div>
  );
}
