import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { eq, schema } from "@ssh-academy/db";
import { getTeamRole, roleAllows } from "./access";
import { db } from "./db";
import { requireSession } from "./session";

/** Lädt ein Team für die Team-Seiten. Wer nicht Mitglied ist, bekommt 404. */
export const loadTeam = cache(async (organizationId: string) => {
  const session = await requireSession();
  const role = await getTeamRole(session.user.id, organizationId);
  if (!role) notFound();
  const [org] = await db.select().from(schema.organization).where(eq(schema.organization.id, organizationId));
  if (!org) notFound();
  const can = {
    manageMembers: roleAllows(role, { member: ["update"] }),
    invite: roleAllows(role, { invitation: ["create"] }),
    manageAccess: roleAllows(role, { accessGrant: ["manage"] }),
    readAudit: roleAllows(role, { audit: ["read"] }),
    readRecordings: roleAllows(role, { recording: ["read"] }),
    settings: roleAllows(role, { settings: ["update"] }),
    deleteTeam: roleAllows(role, { organization: ["delete"] }),
  };
  return { session, role, org, can };
});

/** Wie loadTeam, aber 404 ohne die nötige Berechtigung */
export async function loadTeamWith(organizationId: string, permission: keyof Awaited<ReturnType<typeof loadTeam>>["can"]) {
  const team = await loadTeam(organizationId);
  if (!team.can[permission]) notFound();
  return team;
}
