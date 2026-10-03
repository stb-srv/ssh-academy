"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, schema } from "@ssh-academy/db";
import { isValidLinuxUser } from "@ssh-academy/ssh/ops";
import { z } from "zod";
import { getTeamRole, roleAllows } from "@/lib/access";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionError, requireActionSession, requireStrongSession, runAction } from "@/lib/guard";
import { offboardMember } from "@/lib/offboarding";
import { TEAM_ROLES, type TeamRole } from "@/lib/permissions";
import { requestMeta } from "@/lib/request";

type Permission = Parameters<typeof roleAllows>[1];
const RANK: Record<TeamRole, number> = { viewer: 0, member: 1, operator: 2, admin: 3, owner: 4 };

async function requireTeam(organizationId: string, permission?: Permission, strong = false) {
  const session = strong ? await requireStrongSession() : await requireActionSession();
  const role = await getTeamRole(session.user.id, organizationId);
  if (!role) throw new ActionError("Du bist nicht Mitglied dieses Teams.");
  if (permission && !roleAllows(role, permission)) throw new ActionError("Dafür fehlt dir die Berechtigung in diesem Team.");
  return { session, role };
}

const revalidateTeam = (id: string) => revalidatePath(`/dashboard/teams/${id}`, "layout");

async function logTeam(organizationId: string, actorId: string, action: string, metadata: Record<string, unknown> = {}, target?: { type: string; id: string }) {
  await audit({ action, actorId, organizationId, targetType: target?.type, targetId: target?.id, ...(await requestMeta()), metadata });
}

// ---------------------------------------------------------------------------
// Mitglieder
// ---------------------------------------------------------------------------

const roleSchema = z.enum(TEAM_ROLES as [TeamRole, ...TeamRole[]]);

export async function inviteMember(organizationId: string, _prev: unknown, form: FormData) {
  return runAction(async () => {
    const { session, role } = await requireTeam(organizationId, { invitation: ["create"] });
    const email = z.email("Bitte eine gültige E-Mail-Adresse angeben.").parse(String(form.get("email") ?? "").trim().toLowerCase());
    const newRole = roleSchema.parse(form.get("role"));
    if (RANK[newRole] > RANK[role]) throw new ActionError("Du kannst niemanden mit höherer Rolle als deiner einladen.");
    await auth.api.createInvitation({ body: { email, role: newRole, organizationId }, headers: await headers() });
    await logTeam(organizationId, session.user.id, "invitation.created", { email, role: newRole });
    revalidateTeam(organizationId);
    return {};
  });
}

export async function cancelInvitation(organizationId: string, invitationId: string) {
  return runAction(async () => {
    await requireTeam(organizationId, { invitation: ["cancel"] });
    await auth.api.cancelInvitation({ body: { invitationId }, headers: await headers() });
    revalidateTeam(organizationId);
    return {};
  });
}

async function ownerCount(organizationId: string) {
  const owners = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.role, "owner")));
  return owners.length;
}

export async function changeRole(organizationId: string, memberId: string, newRoleValue: string) {
  return runAction(async () => {
    const { session, role } = await requireTeam(organizationId, { member: ["update"] }, true);
    const newRole = roleSchema.parse(newRoleValue);
    const [target] = await db.select().from(schema.member).where(and(eq(schema.member.id, memberId), eq(schema.member.organizationId, organizationId)));
    if (!target) throw new ActionError("Mitglied nicht gefunden.");
    if (target.userId === session.user.id) throw new ActionError("Du kannst deine eigene Rolle nicht ändern.");
    const oldRole = target.role as TeamRole;
    if ((newRole === "owner" || oldRole === "owner") && role !== "owner") throw new ActionError("Nur Besitzer können die Besitzer-Rolle vergeben oder entziehen.");
    if (RANK[newRole] > RANK[role] || RANK[oldRole] > RANK[role]) throw new ActionError("Du kannst niemanden über deine eigene Rolle hinaus ändern.");
    if (oldRole === "owner" && newRole !== "owner" && (await ownerCount(organizationId)) <= 1) throw new ActionError("Ein Team braucht immer mindestens einen Besitzer.");
    await db.update(schema.member).set({ role: newRole }).where(eq(schema.member.id, memberId));
    await logTeam(organizationId, session.user.id, "member.role_changed", { role: newRole, from: oldRole }, { type: "user", id: target.userId });
    revalidateTeam(organizationId);
    return {};
  });
}

/** Mitglied entfernen oder Team verlassen. Entfernt dabei die Keys der Person von allen Team-Servern. */
export async function removeMember(organizationId: string, memberId: string) {
  return runAction(async () => {
    const session = await requireActionSession();
    const role = await getTeamRole(session.user.id, organizationId);
    const [target] = await db.select().from(schema.member).where(and(eq(schema.member.id, memberId), eq(schema.member.organizationId, organizationId)));
    if (!target || !role) throw new ActionError("Mitglied nicht gefunden.");
    const self = target.userId === session.user.id;
    if (!self) {
      if (!roleAllows(role, { member: ["delete"] })) throw new ActionError("Dafür fehlt dir die Berechtigung.");
      if (RANK[target.role as TeamRole] > RANK[role]) throw new ActionError("Du kannst niemanden mit höherer Rolle entfernen.");
    }
    if (target.role === "owner" && (await ownerCount(organizationId)) <= 1) throw new ActionError("Der letzte Besitzer kann das Team nicht verlassen. Übertrage zuerst die Besitzer-Rolle.");
    await db.delete(schema.member).where(eq(schema.member.id, memberId));
    await logTeam(organizationId, session.user.id, "member.removed", { self }, { type: "user", id: target.userId });
    const results = await offboardMember(organizationId, target.userId, session.user.id);
    revalidateTeam(organizationId);
    revalidatePath("/dashboard/teams");
    return { removedKeys: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
  });
}

// ---------------------------------------------------------------------------
// Nutzergruppen
// ---------------------------------------------------------------------------

const nameSchema = z.string().trim().min(1, "Bitte einen Namen angeben.").max(60);

export async function createUserGroup(organizationId: string, _prev: unknown, form: FormData) {
  return runAction(async () => {
    const { session } = await requireTeam(organizationId, { accessGrant: ["manage"] });
    const name = nameSchema.parse(form.get("name"));
    const description = String(form.get("description") ?? "").trim().slice(0, 200) || null;
    const exists = await db.select().from(schema.userGroup).where(and(eq(schema.userGroup.organizationId, organizationId), eq(schema.userGroup.name, name)));
    if (exists.length) throw new ActionError("Eine Gruppe mit diesem Namen gibt es schon.");
    const [g] = await db.insert(schema.userGroup).values({ organizationId, name, description }).returning();
    await logTeam(organizationId, session.user.id, "group.created", { name }, { type: "user_group", id: g!.id });
    revalidateTeam(organizationId);
    return {};
  });
}

export async function deleteUserGroup(organizationId: string, groupId: string) {
  return runAction(async () => {
    const { session } = await requireTeam(organizationId, { accessGrant: ["manage"] });
    const [g] = await db.delete(schema.userGroup).where(and(eq(schema.userGroup.id, groupId), eq(schema.userGroup.organizationId, organizationId))).returning();
    if (g) await logTeam(organizationId, session.user.id, "group.deleted", { name: g.name }, { type: "user_group", id: groupId });
    revalidateTeam(organizationId);
    return {};
  });
}

export async function setUserGroupMembers(organizationId: string, groupId: string, userIds: string[]) {
  return runAction(async () => {
    const { session } = await requireTeam(organizationId, { accessGrant: ["manage"] });
    const [g] = await db.select().from(schema.userGroup).where(and(eq(schema.userGroup.id, groupId), eq(schema.userGroup.organizationId, organizationId)));
    if (!g) throw new ActionError("Gruppe nicht gefunden.");
    const members = userIds.length
      ? await db.select({ userId: schema.member.userId }).from(schema.member).where(and(eq(schema.member.organizationId, organizationId), inArray(schema.member.userId, userIds)))
      : [];
    await db.transaction(async (tx) => {
      await tx.delete(schema.userGroupMember).where(eq(schema.userGroupMember.groupId, groupId));
      if (members.length) await tx.insert(schema.userGroupMember).values(members.map((m) => ({ groupId, userId: m.userId })));
    });
    await logTeam(organizationId, session.user.id, "group.members_changed", { name: g.name, count: members.length }, { type: "user_group", id: groupId });
    revalidateTeam(organizationId);
    return {};
  });
}

// ---------------------------------------------------------------------------
// Server-Gruppen
// ---------------------------------------------------------------------------

export async function createServerGroup(organizationId: string, _prev: unknown, form: FormData) {
  return runAction(async () => {
    const { session } = await requireTeam(organizationId, { accessGrant: ["manage"] });
    const name = nameSchema.parse(form.get("name"));
    const description = String(form.get("description") ?? "").trim().slice(0, 200) || null;
    const exists = await db.select().from(schema.serverGroup).where(and(eq(schema.serverGroup.organizationId, organizationId), eq(schema.serverGroup.name, name)));
    if (exists.length) throw new ActionError("Eine Server-Gruppe mit diesem Namen gibt es schon.");
    const [g] = await db.insert(schema.serverGroup).values({ organizationId, name, description }).returning();
    await logTeam(organizationId, session.user.id, "server_group.created", { name }, { type: "server_group", id: g!.id });
    revalidateTeam(organizationId);
    return {};
  });
}

export async function deleteServerGroup(organizationId: string, groupId: string) {
  return runAction(async () => {
    const { session } = await requireTeam(organizationId, { accessGrant: ["manage"] });
    const [g] = await db.delete(schema.serverGroup).where(and(eq(schema.serverGroup.id, groupId), eq(schema.serverGroup.organizationId, organizationId))).returning();
    if (g) await logTeam(organizationId, session.user.id, "server_group.deleted", { name: g.name }, { type: "server_group", id: groupId });
    revalidateTeam(organizationId);
    return {};
  });
}

export async function setServerGroupMembers(organizationId: string, groupId: string, serverIds: string[]) {
  return runAction(async () => {
    const { session } = await requireTeam(organizationId, { accessGrant: ["manage"] });
    const [g] = await db.select().from(schema.serverGroup).where(and(eq(schema.serverGroup.id, groupId), eq(schema.serverGroup.organizationId, organizationId)));
    if (!g) throw new ActionError("Server-Gruppe nicht gefunden.");
    const servers = serverIds.length
      ? await db.select({ id: schema.server.id }).from(schema.server).where(and(eq(schema.server.organizationId, organizationId), inArray(schema.server.id, serverIds)))
      : [];
    await db.transaction(async (tx) => {
      await tx.delete(schema.serverGroupMember).where(eq(schema.serverGroupMember.groupId, groupId));
      if (servers.length) await tx.insert(schema.serverGroupMember).values(servers.map((s) => ({ groupId, serverId: s.id })));
    });
    await logTeam(organizationId, session.user.id, "server_group.members_changed", { name: g.name, count: servers.length }, { type: "server_group", id: groupId });
    revalidateTeam(organizationId);
    return {};
  });
}

// ---------------------------------------------------------------------------
// Freigaben
// ---------------------------------------------------------------------------

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => !d || !Number.isNaN(d.getTime()), "Ungültiges Datum.");

export async function createGrant(organizationId: string, _prev: unknown, form: FormData) {
  return runAction(async () => {
    const { session } = await requireTeam(organizationId, { accessGrant: ["manage"] }, true);
    const [subjectType, subjectId] = String(form.get("subject") ?? "").split(":");
    const [targetType, targetId] = String(form.get("target") ?? "").split(":");
    const linuxUser = String(form.get("linuxUser") ?? "").trim();
    if (!isValidLinuxUser(linuxUser)) throw new ActionError("Bitte einen gültigen Linux-Benutzer angeben.");
    const validFrom = optionalDate.parse(String(form.get("validFrom") ?? "") || undefined);
    const validUntil = optionalDate.parse(String(form.get("validUntil") ?? "") || undefined);
    if (validFrom && validUntil && validUntil <= validFrom) throw new ActionError("Das Ende muss nach dem Beginn liegen.");

    // Subjekt und Ziel müssen zum Team gehören
    if (subjectType === "user") {
      const [m] = await db.select().from(schema.member).where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, subjectId!)));
      if (!m) throw new ActionError("Diese Person ist nicht im Team.");
    } else if (subjectType === "group") {
      const [g] = await db.select().from(schema.userGroup).where(and(eq(schema.userGroup.organizationId, organizationId), eq(schema.userGroup.id, subjectId!)));
      if (!g) throw new ActionError("Gruppe nicht gefunden.");
    } else throw new ActionError("Bitte wählen, für wen die Freigabe gilt.");
    if (targetType === "server") {
      const [s] = await db.select().from(schema.server).where(and(eq(schema.server.organizationId, organizationId), eq(schema.server.id, targetId!)));
      if (!s) throw new ActionError("Server nicht gefunden.");
    } else if (targetType === "group") {
      const [g] = await db.select().from(schema.serverGroup).where(and(eq(schema.serverGroup.organizationId, organizationId), eq(schema.serverGroup.id, targetId!)));
      if (!g) throw new ActionError("Server-Gruppe nicht gefunden.");
    } else throw new ActionError("Bitte ein Ziel wählen.");

    const [grant] = await db
      .insert(schema.accessGrant)
      .values({
        organizationId,
        subjectType: subjectType === "user" ? "user" : "user_group",
        subjectUserId: subjectType === "user" ? subjectId! : null,
        subjectGroupId: subjectType === "group" ? subjectId! : null,
        targetType: targetType === "server" ? "server" : "server_group",
        targetServerId: targetType === "server" ? targetId! : null,
        targetGroupId: targetType === "group" ? targetId! : null,
        linuxUser,
        validFrom,
        validUntil,
        createdBy: session.user.id,
      })
      .returning();
    await logTeam(organizationId, session.user.id, "grant.created", { subject: `${subjectType}:${subjectId}`, target: `${targetType}:${targetId}`, linuxUser, validUntil }, { type: "access_grant", id: grant!.id });
    revalidateTeam(organizationId);
    return {};
  });
}

export async function deleteGrant(organizationId: string, grantId: string) {
  return runAction(async () => {
    const { session } = await requireTeam(organizationId, { accessGrant: ["manage"] });
    const [g] = await db.delete(schema.accessGrant).where(and(eq(schema.accessGrant.id, grantId), eq(schema.accessGrant.organizationId, organizationId))).returning();
    if (g) await logTeam(organizationId, session.user.id, "grant.deleted", { linuxUser: g.linuxUser }, { type: "access_grant", id: grantId });
    revalidateTeam(organizationId);
    return {};
  });
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  recordSessions: z.enum(["on"]).optional().transform((v) => v === "on"),
  idleTimeoutMinutes: z.coerce.number().int().min(1).max(240),
  maxSessionHours: z.coerce.number().int().min(1).max(24),
  maxCertMinutes: z.coerce.number().int().min(5).max(60 * 24 * 30),
});

export async function updateTeamSettings(organizationId: string, _prev: unknown, form: FormData) {
  return runAction(async () => {
    const { session } = await requireTeam(organizationId, { settings: ["update"] }, true);
    const data = settingsSchema.parse(Object.fromEntries(form));
    const { name, ...settings } = data;
    await db.update(schema.organization).set({ name }).where(eq(schema.organization.id, organizationId));
    await db
      .insert(schema.teamSettings)
      .values({ organizationId, ...settings })
      .onConflictDoUpdate({ target: schema.teamSettings.organizationId, set: settings });
    await logTeam(organizationId, session.user.id, "team.settings_changed", data);
    revalidateTeam(organizationId);
    return {};
  });
}

export async function deleteTeam(organizationId: string, confirmName: string) {
  return runAction(async () => {
    const { session } = await requireTeam(organizationId, { organization: ["delete"] }, true);
    const [org] = await db.select().from(schema.organization).where(eq(schema.organization.id, organizationId));
    if (!org || org.name !== confirmName) throw new ActionError("Bitte den Team-Namen genau eintippen.");
    await audit({ action: "team.deleted", actorId: session.user.id, metadata: { name: org.name, organizationId } });
    await db.delete(schema.organization).where(eq(schema.organization.id, organizationId));
    revalidatePath("/dashboard/teams");
    return {};
  });
}
