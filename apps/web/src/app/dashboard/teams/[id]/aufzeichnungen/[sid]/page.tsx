import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordingPlayer } from "@/components/teams/recording-player";
import { formatDateTime } from "@/lib/format";
import { loadRecording } from "@/lib/recordings";
import { loadTeamWith } from "@/lib/team";

export const metadata: Metadata = { title: "Aufzeichnung" };

export default async function RecordingPage({ params }: PageProps<"/dashboard/teams/[id]/aufzeichnungen/[sid]">) {
  const { id, sid } = await params;
  const { session } = await loadTeamWith(id, "readRecordings");
  const row = /^[0-9a-f-]{36}$/.test(sid) ? await loadRecording(session.user.id, sid) : null;
  if (!row || row.session.organizationId !== id) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/dashboard/teams/${id}/aufzeichnungen`} className="text-sm text-muted hover:underline">
        ← Alle Aufzeichnungen
      </Link>
      <p className="text-sm">
        <span className="font-medium">{row.userName ?? "Gelöschter Nutzer"}</span> auf {row.serverName ?? "gelöschtem Server"} als{" "}
        <code className="font-mono">{row.session.linuxUser}</code>, {formatDateTime(row.session.startedAt)}
      </p>
      <RecordingPlayer src={`/api/recordings/${sid}`} />
    </div>
  );
}
