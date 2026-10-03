import "server-only";
import { schema } from "@ssh-academy/db";
import { db } from "./db";

type AuditInput = {
  action: string;
  actorId?: string | null;
  organizationId?: string | null;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

/** Schreibt einen Eintrag ins Audit-Log. Fehler beim Loggen dürfen die eigentliche Aktion nicht abbrechen. */
export async function audit(input: AuditInput) {
  try {
    await db.insert(schema.auditEvent).values({
      action: input.action,
      actorId: input.actorId ?? null,
      organizationId: input.organizationId ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      ip: input.ip && isIp(input.ip) ? input.ip : null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    console.error("[audit] konnte Eintrag nicht schreiben", err);
  }
}

function isIp(value: string) {
  return /^[0-9a-fA-F:.]+$/.test(value);
}
