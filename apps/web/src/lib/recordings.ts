import "server-only";
import { gunzipSync } from "node:zlib";
import { eq, schema } from "@ssh-academy/db";
import { getTeamRole, roleAllows } from "./access";
import { db } from "./db";

/** Lädt eine Aufzeichnung, wenn der Nutzer im Team Aufzeichnungen ansehen darf */
export async function loadRecording(userId: string, sessionId: string) {
  const [row] = await db
    .select({ session: schema.connectionSession, recording: schema.sessionRecording, serverName: schema.server.name, userName: schema.user.name })
    .from(schema.sessionRecording)
    .innerJoin(schema.connectionSession, eq(schema.connectionSession.id, schema.sessionRecording.sessionId))
    .leftJoin(schema.server, eq(schema.server.id, schema.connectionSession.serverId))
    .leftJoin(schema.user, eq(schema.user.id, schema.connectionSession.userId))
    .where(eq(schema.sessionRecording.sessionId, sessionId));
  if (!row?.session.organizationId) return null;
  const role = await getTeamRole(userId, row.session.organizationId);
  if (!roleAllows(role, { recording: ["read"] })) return null;
  return row;
}

export function decodeRecording(data: string) {
  return gunzipSync(Buffer.from(data, "base64")).toString("utf8");
}
