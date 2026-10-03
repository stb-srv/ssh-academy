import "server-only";
import { and, eq, schema } from "@ssh-academy/db";
import { db } from "./db";
import { POCKET_ID_PROVIDER } from "./env";

export async function getSecurityOverview(userId: string) {
  const [user] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
  const passkeys = await db
    .select({
      id: schema.passkey.id,
      name: schema.passkey.name,
      createdAt: schema.passkey.createdAt,
      deviceType: schema.passkey.deviceType,
      backedUp: schema.passkey.backedUp,
    })
    .from(schema.passkey)
    .where(eq(schema.passkey.userId, userId));
  const accounts = await db
    .select({ id: schema.account.id, providerId: schema.account.providerId, createdAt: schema.account.createdAt })
    .from(schema.account)
    .where(eq(schema.account.userId, userId));
  const [pocketIdGroups] = await db
    .select()
    .from(schema.idpUserGroups)
    .where(and(eq(schema.idpUserGroups.userId, userId), eq(schema.idpUserGroups.providerId, POCKET_ID_PROVIDER)));

  const hasPassword = accounts.some((a) => a.providerId === "credential");
  const pocketIdAccount = accounts.find((a) => a.providerId === POCKET_ID_PROVIDER);
  const pocketIdLinked = Boolean(pocketIdAccount);
  const totpEnabled = Boolean(user?.twoFactorEnabled);

  return {
    passkeys,
    hasPassword,
    pocketIdLinked,
    pocketIdAccountId: pocketIdAccount?.id ?? null,
    pocketIdGroups: pocketIdGroups?.groups ?? [],
    pocketIdSyncedAt: pocketIdGroups?.syncedAt ?? null,
    totpEnabled,
    /**
     * Starke Anmeldung (Voraussetzung für Server und Tresor ab Phase 2):
     * TOTP aktiv, mindestens ein Passkey oder Pocket ID (Passkey-Login) verbunden.
     */
    strongAuth: totpEnabled || passkeys.length > 0 || pocketIdLinked,
  };
}

export type SecurityOverview = Awaited<ReturnType<typeof getSecurityOverview>>;
