import "server-only";
import { and, eq, inArray, schema } from "@ssh-academy/db";
import type { AuthContext } from "better-auth";
import { decryptOAuthToken } from "better-auth/oauth2";
import { decodeJwt } from "jose";
import { db } from "./db";
import { env, POCKET_ID_PROVIDER } from "./env";
import { PLATFORM_ADMIN_ROLE, PLATFORM_USER_ROLE, TEAM_ROLES, type TeamRole } from "./permissions";

/** Gruppen aus Pocket-ID-Claims lesen (Claim `groups`, Liste von Gruppennamen) */
export function extractGroups(claims: Record<string, unknown>): string[] {
  const raw = claims.groups;
  if (!Array.isArray(raw)) return [];
  return raw.filter((g): g is string => typeof g === "string");
}

/**
 * Liest die aktuellen Gruppen des Nutzers aus dem gespeicherten ID-Token (wurde beim Login
 * von Better Auth gegen die JWKS von Pocket ID geprüft). Fallback: Userinfo-Endpunkt.
 * Gibt `null` zurück, wenn keine Gruppeninformation verfügbar ist (dann wird nichts geändert).
 */
export async function readPocketIdGroups(ctx: AuthContext, userId: string): Promise<string[] | null> {
  const [account] = await db
    .select()
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, POCKET_ID_PROVIDER)))
    .limit(1);
  if (!account) return null;

  if (account.idToken) {
    const idToken = await decryptOAuthToken(account.idToken, ctx);
    const claims = decodeJwt(idToken);
    if ("groups" in claims) return extractGroups(claims);
  }

  if (account.accessToken && env.POCKET_ID_URL) {
    const accessToken = await decryptOAuthToken(account.accessToken, ctx);
    const res = await fetch(`${env.POCKET_ID_URL.replace(/\/$/, "")}/api/oidc/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const info = (await res.json()) as Record<string, unknown>;
      if ("groups" in info) return extractGroups(info);
    }
  }
  return null;
}

const ROLE_RANK: Record<TeamRole, number> = { viewer: 0, member: 1, operator: 2, admin: 3, owner: 4 };

function higherRole(a: TeamRole | undefined, b: TeamRole): TeamRole {
  return a && ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

/**
 * Gleicht Team-Mitgliedschaften und Plattform-Rolle mit den Pocket-ID-Gruppen ab.
 * Nur Einträge, die dieser Abgleich selbst angelegt hat, werden geändert oder entfernt;
 * manuell vergebene Mitgliedschaften bleiben unangetastet.
 */
export async function syncPocketIdGroups(userId: string, groups: string[]) {
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.idpUserGroups)
      .values({ userId, providerId: POCKET_ID_PROVIDER, groups, syncedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.idpUserGroups.userId, schema.idpUserGroups.providerId],
        set: { groups, syncedAt: new Date() },
      });

    const mappings = groups.length
      ? await tx
          .select()
          .from(schema.idpGroupMapping)
          .where(
            and(
              eq(schema.idpGroupMapping.providerId, POCKET_ID_PROVIDER),
              inArray(schema.idpGroupMapping.externalGroup, groups),
            ),
          )
      : [];

    // Gewünschter Zustand: höchste Rolle pro Team
    const desired = new Map<string, TeamRole>();
    let wantsPlatformAdmin = false;
    for (const m of mappings) {
      if (m.organizationId && m.role && TEAM_ROLES.includes(m.role as TeamRole)) {
        desired.set(m.organizationId, higherRole(desired.get(m.organizationId), m.role as TeamRole));
      }
      if (m.platformRole === PLATFORM_ADMIN_ROLE) wantsPlatformAdmin = true;
    }

    const managed = await tx
      .select()
      .from(schema.idpManagedGrant)
      .where(
        and(
          eq(schema.idpManagedGrant.userId, userId),
          eq(schema.idpManagedGrant.providerId, POCKET_ID_PROVIDER),
        ),
      );
    const managedOrgs = new Set(managed.filter((g) => g.organizationId).map((g) => g.organizationId!));
    const managesPlatformRole = managed.some((g) => g.kind === "platform_role");

    const existingMembers = await tx
      .select()
      .from(schema.member)
      .where(eq(schema.member.userId, userId));
    const memberByOrg = new Map(existingMembers.map((m) => [m.organizationId, m]));

    // Hinzufügen bzw. Rolle anpassen
    for (const [organizationId, role] of desired) {
      const existing = memberByOrg.get(organizationId);
      if (!existing) {
        await tx.insert(schema.member).values({
          id: crypto.randomUUID(),
          organizationId,
          userId,
          role,
          createdAt: new Date(),
        });
        await tx.insert(schema.idpManagedGrant).values({
          userId,
          providerId: POCKET_ID_PROVIDER,
          kind: "membership",
          organizationId,
        });
      } else if (managedOrgs.has(organizationId) && existing.role !== role) {
        await tx.update(schema.member).set({ role }).where(eq(schema.member.id, existing.id));
      }
      // Manuell angelegte Mitgliedschaften werden nicht überschrieben.
    }

    // Entfernen: verwaltete Mitgliedschaften, deren Gruppe weggefallen ist
    for (const organizationId of managedOrgs) {
      if (desired.has(organizationId)) continue;
      await tx
        .delete(schema.member)
        .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)));
      await tx
        .delete(schema.idpManagedGrant)
        .where(
          and(
            eq(schema.idpManagedGrant.userId, userId),
            eq(schema.idpManagedGrant.providerId, POCKET_ID_PROVIDER),
            eq(schema.idpManagedGrant.organizationId, organizationId),
          ),
        );
    }

    // Plattform-Rolle
    const [user] = await tx.select().from(schema.user).where(eq(schema.user.id, userId));
    if (!user) return;
    if (wantsPlatformAdmin && user.role !== PLATFORM_ADMIN_ROLE) {
      await tx.update(schema.user).set({ role: PLATFORM_ADMIN_ROLE }).where(eq(schema.user.id, userId));
      await tx
        .insert(schema.idpManagedGrant)
        .values({ userId, providerId: POCKET_ID_PROVIDER, kind: "platform_role" });
    } else if (!wantsPlatformAdmin && managesPlatformRole) {
      await tx.update(schema.user).set({ role: PLATFORM_USER_ROLE }).where(eq(schema.user.id, userId));
      await tx
        .delete(schema.idpManagedGrant)
        .where(
          and(
            eq(schema.idpManagedGrant.userId, userId),
            eq(schema.idpManagedGrant.providerId, POCKET_ID_PROVIDER),
            eq(schema.idpManagedGrant.kind, "platform_role"),
          ),
        );
    }
  });
}
