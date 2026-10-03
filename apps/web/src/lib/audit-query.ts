import "server-only";
import { and, desc, eq, schema, type SQL } from "@ssh-academy/db";
import { db } from "./db";

export async function loadAudit(where: SQL | undefined, limit = 100, offset = 0) {
  return db
    .select({
      id: schema.auditEvent.id,
      action: schema.auditEvent.action,
      createdAt: schema.auditEvent.createdAt,
      actorName: schema.user.name,
      ip: schema.auditEvent.ip,
      metadata: schema.auditEvent.metadata,
      targetType: schema.auditEvent.targetType,
    })
    .from(schema.auditEvent)
    .leftJoin(schema.user, eq(schema.user.id, schema.auditEvent.actorId))
    .where(where)
    .orderBy(desc(schema.auditEvent.createdAt))
    .limit(limit)
    .offset(offset);
}

export const personalAudit = (userId: string) => and(eq(schema.auditEvent.actorId, userId));
