import "server-only";
import { and, eq, inArray, ne, schema } from "@ssh-academy/db";
import { audit } from "./audit";
import { db } from "./db";
import { revokeDeployment } from "./server-ops";

/**
 * Offboarding (Projektkonzept 6.3): Verlässt jemand ein Team, werden seine persönlichen Keys
 * von allen Servern des Teams entfernt, seine Freigaben und Gruppenmitgliedschaften gelöscht.
 * Läuft bei manuellem Entfernen, beim Pocket-ID-Gruppenabgleich und beim Sperren über die Pocket-ID-API.
 */
export async function offboardMember(organizationId: string, userId: string, actorId: string | null) {
  const deployments = await db
    .select({ id: schema.keyDeployment.id, server: schema.server.name, linuxUser: schema.keyDeployment.linuxUser })
    .from(schema.keyDeployment)
    .innerJoin(schema.sshKey, eq(schema.sshKey.id, schema.keyDeployment.keyId))
    .innerJoin(schema.server, eq(schema.server.id, schema.keyDeployment.serverId))
    .where(
      and(
        eq(schema.sshKey.ownerUserId, userId),
        eq(schema.server.organizationId, organizationId),
        ne(schema.keyDeployment.status, "removed"),
      ),
    );

  const results = [];
  for (const d of deployments) {
    const r = await revokeDeployment(d.id, actorId ?? userId);
    results.push({ server: d.server, linuxUser: d.linuxUser, ok: r.ok, error: r.ok ? undefined : r.error });
  }

  const groups = await db.select({ id: schema.userGroup.id }).from(schema.userGroup).where(eq(schema.userGroup.organizationId, organizationId));
  if (groups.length) {
    await db
      .delete(schema.userGroupMember)
      .where(and(eq(schema.userGroupMember.userId, userId), inArray(schema.userGroupMember.groupId, groups.map((g) => g.id))));
  }
  await db.delete(schema.accessGrant).where(and(eq(schema.accessGrant.organizationId, organizationId), eq(schema.accessGrant.subjectUserId, userId)));
  // Laufende Verbindungen auf Team-Servern beenden (das Gateway prüft den Status alle 30 Sekunden)
  await db
    .update(schema.connectionSession)
    .set({ status: "closed", tokenHash: null, endedAt: new Date(), endReason: "Aus dem Team entfernt" })
    .where(
      and(
        eq(schema.connectionSession.userId, userId),
        eq(schema.connectionSession.organizationId, organizationId),
        inArray(schema.connectionSession.status, ["pending", "active"]),
      ),
    );

  await audit({
    action: "member.offboarded",
    actorId,
    organizationId,
    targetType: "user",
    targetId: userId,
    metadata: { keysRemoved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) },
  });
  return results;
}
