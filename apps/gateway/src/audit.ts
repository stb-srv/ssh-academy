import { schema } from "@ssh-academy/db";
import { db } from "./db";

export async function audit(entry: {
  action: string;
  actorId?: string | null;
  organizationId?: string | null;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(schema.auditEvent).values({
      action: entry.action,
      actorId: entry.actorId ?? null,
      organizationId: entry.organizationId ?? null,
      targetType: entry.targetType,
      targetId: entry.targetId,
      ip: entry.ip && /^[0-9a-fA-F:.]+$/.test(entry.ip) ? entry.ip : null,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    console.error("[audit] konnte Eintrag nicht schreiben", err);
  }
}
