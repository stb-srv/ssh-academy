"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, schema } from "@ssh-academy/db";
import { z } from "zod";
import { generateToken, isApiScope } from "@/lib/api-tokens";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ActionError, requireActionSession, requireStrongSession, runAction } from "@/lib/guard";
import { requestMeta } from "@/lib/request";

export async function createApiToken(_prev: unknown, form: FormData) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const name = z.string().trim().min(1, "Bitte einen Namen angeben.").max(60).parse(form.get("name"));
    const scopes = form.getAll("scopes").map(String).filter(isApiScope);
    if (!scopes.length) throw new ActionError("Bitte mindestens ein Recht wählen.");
    const days = z.coerce.number().int().min(0).max(365).parse(form.get("days") ?? 90);
    const active = await db.select({ id: schema.apiToken.id }).from(schema.apiToken).where(and(eq(schema.apiToken.userId, session.user.id), isNull(schema.apiToken.revokedAt)));
    if (active.length >= 20) throw new ActionError("Höchstens 20 aktive Tokens. Widerrufe zuerst alte.");
    const { token, hash, prefix } = generateToken();
    const [row] = await db
      .insert(schema.apiToken)
      .values({ userId: session.user.id, name, prefix, tokenHash: hash, scopes, expiresAt: days ? new Date(Date.now() + days * 86400_000) : null })
      .returning({ id: schema.apiToken.id });
    await audit({ action: "api_token.created", actorId: session.user.id, targetType: "api_token", targetId: row!.id, ...(await requestMeta()), metadata: { name, scopes, days } });
    revalidatePath("/dashboard/api-tokens");
    return { token };
  });
}

export async function revokeApiToken(id: string) {
  return runAction(async () => {
    const session = await requireActionSession();
    const [row] = await db
      .update(schema.apiToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.apiToken.id, id), eq(schema.apiToken.userId, session.user.id), isNull(schema.apiToken.revokedAt)))
      .returning();
    if (!row) throw new ActionError("Token nicht gefunden.");
    await audit({ action: "api_token.revoked", actorId: session.user.id, targetType: "api_token", targetId: id, ...(await requestMeta()), metadata: { name: row.name } });
    revalidatePath("/dashboard/api-tokens");
    return {};
  });
}
