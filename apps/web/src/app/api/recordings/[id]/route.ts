import { audit } from "@/lib/audit";
import { decodeRecording, loadRecording } from "@/lib/recordings";
import { requestMeta } from "@/lib/request";
import { getSession } from "@/lib/session";

/** Liefert eine Aufzeichnung als asciicast v2 (nur für Team-Rollen mit recording:read) */
export async function GET(_req: Request, ctx: RouteContext<"/api/recordings/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return new Response("Nicht angemeldet", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const row = await loadRecording(session.user.id, id);
  if (!row) return new Response("Nicht gefunden", { status: 404 });
  await audit({
    action: "recording.viewed",
    actorId: session.user.id,
    organizationId: row.session.organizationId,
    targetType: "connection_session",
    targetId: id,
    ...(await requestMeta()),
    metadata: { linuxUser: row.session.linuxUser, server: row.serverName },
  });
  return new Response(decodeRecording(row.recording.data), {
    headers: { "content-type": "application/x-asciicast; charset=utf-8", "cache-control": "private, no-store" },
  });
}
