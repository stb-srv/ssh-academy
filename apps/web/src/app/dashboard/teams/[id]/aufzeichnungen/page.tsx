import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, schema } from "@ssh-academy/db";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatBytes, formatDateTime } from "@/lib/format";
import { getTeamSettings } from "@/lib/access";
import { loadTeamWith } from "@/lib/team";

export const metadata: Metadata = { title: "Aufzeichnungen" };

function duration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

export default async function RecordingsPage({ params }: PageProps<"/dashboard/teams/[id]/aufzeichnungen">) {
  const { id } = await params;
  await loadTeamWith(id, "readRecordings");
  const settings = await getTeamSettings(id);
  const rows = await db
    .select({
      id: schema.connectionSession.id,
      linuxUser: schema.connectionSession.linuxUser,
      startedAt: schema.connectionSession.startedAt,
      serverName: schema.server.name,
      userName: schema.user.name,
      size: schema.sessionRecording.sizeBytes,
      durationMs: schema.sessionRecording.durationMs,
    })
    .from(schema.sessionRecording)
    .innerJoin(schema.connectionSession, eq(schema.connectionSession.id, schema.sessionRecording.sessionId))
    .leftJoin(schema.server, eq(schema.server.id, schema.connectionSession.serverId))
    .leftJoin(schema.user, eq(schema.user.id, schema.connectionSession.userId))
    .where(eq(schema.connectionSession.organizationId, id))
    .orderBy(desc(schema.connectionSession.createdAt))
    .limit(200);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {settings.recordSessions
          ? "Terminal-Sitzungen auf Team-Servern werden aufgezeichnet. Jedes Abspielen wird im Protokoll vermerkt."
          : "Die Aufzeichnung ist in den Team-Einstellungen ausgeschaltet. Hier stehen nur ältere Aufzeichnungen."}
      </p>
      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Aufzeichnungen.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="w-36 shrink-0 text-muted">{formatDateTime(r.startedAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.userName ?? "Gelöschter Nutzer"}</span> auf {r.serverName ?? "gelöschtem Server"} als{" "}
                  <code className="font-mono">{r.linuxUser}</code>
                </span>
                <span className="text-xs text-muted">
                  {duration(r.durationMs)} · {formatBytes(r.size)}
                </span>
                <Link href={`/dashboard/teams/${id}/aufzeichnungen/${r.id}`} className="text-primary hover:underline">
                  Abspielen
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
