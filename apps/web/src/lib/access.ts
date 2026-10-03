import "server-only";
import { and, eq, gt, inArray, isNull, lte, or, schema } from "@ssh-academy/db";
import { db } from "./db";
import { roles, type TeamRole } from "./permissions";

/**
 * Zentrale Berechtigungsprüfung (Projektkonzept 6.3). Jede Server-Action und jede Seite fragt hier,
 * nie nur im Frontend. Persönliche Objekte darf nur ihr Besitzer nutzen; Team-Objekte richten sich
 * nach der Team-Rolle und für Mitglieder zusätzlich nach Zugriffsfreigaben.
 */

export type Owned = { ownerUserId: string | null; organizationId: string | null };
type Permission = Parameters<(typeof roles)["owner"]["authorize"]>[0];

export async function getMemberships(userId: string) {
  const rows = await db
    .select({ organizationId: schema.member.organizationId, role: schema.member.role, name: schema.organization.name })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, userId));
  return rows.map((r) => ({ ...r, role: r.role as TeamRole }));
}

export async function getTeamRole(userId: string, organizationId: string): Promise<TeamRole | null> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)));
  return (row?.role as TeamRole | undefined) ?? null;
}

export function roleAllows(role: TeamRole | null, permission: Permission) {
  if (!role || !(role in roles)) return false;
  return roles[role].authorize(permission).success;
}

/** Darf der Nutzer an einem persönlichen oder Team-Objekt diese Aktion ausführen? */
export async function canOnOwned(userId: string, owned: Owned, permission: Permission) {
  if (owned.ownerUserId) return owned.ownerUserId === userId;
  if (!owned.organizationId) return false;
  return roleAllows(await getTeamRole(userId, owned.organizationId), permission);
}

/** Besitzer-Auswahl beim Anlegen: persönlich oder ein Team mit passender Berechtigung */
export async function ownerTargets(userId: string, permission: Permission) {
  const memberships = await getMemberships(userId);
  return memberships.filter((m) => roleAllows(m.role, permission)).map((m) => ({ organizationId: m.organizationId, name: m.name }));
}

export async function resolveOwner(userId: string, ownerValue: string, permission: Permission): Promise<Owned | null> {
  if (ownerValue === "personal" || !ownerValue) return { ownerUserId: userId, organizationId: null };
  const allowed = await ownerTargets(userId, permission);
  return allowed.some((t) => t.organizationId === ownerValue) ? { ownerUserId: null, organizationId: ownerValue } : null;
}

// ---------------------------------------------------------------------------
// Freigaben
// ---------------------------------------------------------------------------

/** Aktive Freigaben eines Nutzers in einem Team: Server-IDs und Linux-Benutzer */
export async function activeGrants(userId: string, organizationId?: string) {
  const now = new Date();
  const groupIds = (
    await db.select({ id: schema.userGroupMember.groupId }).from(schema.userGroupMember).where(eq(schema.userGroupMember.userId, userId))
  ).map((g) => g.id);

  const grants = await db
    .select()
    .from(schema.accessGrant)
    .where(
      and(
        organizationId ? eq(schema.accessGrant.organizationId, organizationId) : undefined,
        or(
          eq(schema.accessGrant.subjectUserId, userId),
          groupIds.length ? inArray(schema.accessGrant.subjectGroupId, groupIds) : undefined,
        ),
        or(isNull(schema.accessGrant.validFrom), lte(schema.accessGrant.validFrom, now)),
        or(isNull(schema.accessGrant.validUntil), gt(schema.accessGrant.validUntil, now)),
      ),
    );

  const serverGroupIds = grants.flatMap((g) => (g.targetGroupId ? [g.targetGroupId] : []));
  const groupServers = serverGroupIds.length
    ? await db.select().from(schema.serverGroupMember).where(inArray(schema.serverGroupMember.groupId, serverGroupIds))
    : [];

  // serverId -> erlaubte Linux-Benutzer
  const byServer = new Map<string, Set<string>>();
  const add = (serverId: string, linuxUser: string) => {
    if (!byServer.has(serverId)) byServer.set(serverId, new Set());
    byServer.get(serverId)!.add(linuxUser);
  };
  for (const g of grants) {
    if (g.targetServerId) add(g.targetServerId, g.linuxUser);
    for (const gs of groupServers) if (gs.groupId === g.targetGroupId) add(gs.serverId, g.linuxUser);
  }
  return byServer;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export type ServerAccess = {
  server: typeof schema.server.$inferSelect;
  role: TeamRole | "personal";
  canRead: boolean;
  canManage: boolean;
  canConnect: boolean;
  /** Linux-Benutzer, als die verbunden werden darf ("any" = beliebig) */
  linuxUsers: string[] | "any";
};

function accessFor(server: typeof schema.server.$inferSelect, userId: string, role: TeamRole | null, granted: Set<string> | undefined): ServerAccess | null {
  if (server.ownerUserId) {
    if (server.ownerUserId !== userId) return null;
    return { server, role: "personal", canRead: true, canManage: true, canConnect: true, linuxUsers: "any" };
  }
  if (!role) return null;
  const canManage = roleAllows(role, { server: ["update"] });
  if (canManage) return { server, role, canRead: true, canManage: true, canConnect: true, linuxUsers: "any" };
  // Mitglieder sehen nur freigegebene Server, Betrachter sehen alle (nur lesend)
  if (role === "viewer") return { server, role, canRead: true, canManage: false, canConnect: false, linuxUsers: [] };
  if (!granted?.size) return null;
  return { server, role, canRead: true, canManage: false, canConnect: roleAllows(role, { server: ["connect"] }), linuxUsers: [...granted] };
}

export async function getServerAccess(userId: string, serverId: string): Promise<ServerAccess | null> {
  const [server] = await db.select().from(schema.server).where(eq(schema.server.id, serverId));
  if (!server) return null;
  const role = server.organizationId ? await getTeamRole(userId, server.organizationId) : null;
  const grants = server.organizationId && role ? await activeGrants(userId, server.organizationId) : undefined;
  return accessFor(server, userId, role, grants?.get(server.id));
}

export async function listAccessibleServers(userId: string) {
  const memberships = await getMemberships(userId);
  const orgIds = memberships.map((m) => m.organizationId);
  const servers = await db
    .select()
    .from(schema.server)
    .where(or(eq(schema.server.ownerUserId, userId), orgIds.length ? inArray(schema.server.organizationId, orgIds) : undefined))
    .orderBy(schema.server.name);
  const grants = orgIds.length ? await activeGrants(userId) : new Map<string, Set<string>>();
  const roleByOrg = new Map(memberships.map((m) => [m.organizationId, m.role]));
  const teamName = new Map(memberships.map((m) => [m.organizationId, m.name]));
  return servers
    .map((s) => accessFor(s, userId, s.organizationId ? (roleByOrg.get(s.organizationId) ?? null) : null, grants.get(s.id)))
    .filter((a): a is ServerAccess => a !== null)
    .map((a) => ({ ...a, teamName: a.server.organizationId ? teamName.get(a.server.organizationId) : undefined }));
}

export function mayConnectAs(access: ServerAccess, linuxUser: string) {
  return access.canConnect && (access.linuxUsers === "any" || access.linuxUsers.includes(linuxUser));
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export type KeyAccess = {
  key: typeof schema.sshKey.$inferSelect;
  canManage: boolean;
  /** Darf der Nutzer mit diesem (Tresor-)Key Verbindungen aufbauen? */
  canUse: boolean;
};

export async function getKeyAccess(userId: string, keyId: string): Promise<KeyAccess | null> {
  const [key] = await db.select().from(schema.sshKey).where(eq(schema.sshKey.id, keyId));
  if (!key) return null;
  if (key.ownerUserId) return key.ownerUserId === userId ? { key, canManage: true, canUse: true } : null;
  const role = await getTeamRole(userId, key.organizationId!);
  if (!roleAllows(role, { sshKey: ["read"] })) return null;
  const canManage = roleAllows(role, { sshKey: ["deploy"] });
  return { key, canManage, canUse: canManage };
}

export async function listAccessibleKeys(userId: string) {
  const memberships = await getMemberships(userId);
  const readable = memberships.filter((m) => roleAllows(m.role, { sshKey: ["read"] }));
  const keys = await db
    .select()
    .from(schema.sshKey)
    .where(
      or(
        eq(schema.sshKey.ownerUserId, userId),
        readable.length ? inArray(schema.sshKey.organizationId, readable.map((m) => m.organizationId)) : undefined,
      ),
    )
    .orderBy(schema.sshKey.createdAt);
  const roleByOrg = new Map(memberships.map((m) => [m.organizationId, m]));
  return keys.map((key) => {
    const m = key.organizationId ? roleByOrg.get(key.organizationId) : undefined;
    const canManage = key.ownerUserId === userId || roleAllows(m?.role ?? null, { sshKey: ["deploy"] });
    return { key, teamName: m?.name, canManage, canUse: canManage };
  });
}

export function keyIsUsable(key: typeof schema.sshKey.$inferSelect) {
  return !key.revokedAt && (!key.expiresAt || key.expiresAt > new Date());
}

/** Tresor-Keys, mit denen sich der Nutzer auf diesem Server als linuxUser anmelden kann */
export async function connectableKeys(userId: string, serverId: string, linuxUser?: string) {
  const deployments = await db
    .select({ key: schema.sshKey, linuxUser: schema.keyDeployment.linuxUser })
    .from(schema.keyDeployment)
    .innerJoin(schema.sshKey, eq(schema.sshKey.id, schema.keyDeployment.keyId))
    .where(
      and(
        eq(schema.keyDeployment.serverId, serverId),
        eq(schema.keyDeployment.status, "deployed"),
        eq(schema.sshKey.storageMode, "vault"),
        linuxUser ? eq(schema.keyDeployment.linuxUser, linuxUser) : undefined,
      ),
    );
  const result: { key: typeof schema.sshKey.$inferSelect; linuxUser: string }[] = [];
  for (const d of deployments) {
    if (!keyIsUsable(d.key)) continue;
    const access = await getKeyAccess(userId, d.key.id);
    if (access?.canUse) result.push(d);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Team-Einstellungen
// ---------------------------------------------------------------------------

export async function getTeamSettings(organizationId: string) {
  const [row] = await db.select().from(schema.teamSettings).where(eq(schema.teamSettings.organizationId, organizationId));
  return row ?? { organizationId, recordSessions: false, idleTimeoutMinutes: 15, maxSessionHours: 8, maxCertMinutes: 720 };
}
