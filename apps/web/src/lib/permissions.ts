import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

/**
 * Berechtigungen innerhalb eines Teams (siehe Projektkonzept, Kapitel 6.2).
 * Wird sowohl serverseitig (Better Auth organization plugin) als auch im Client genutzt.
 */
export const statements = {
  ...defaultStatements,
  server: ["create", "update", "delete", "read", "connect"],
  sshKey: ["create", "deploy", "revoke", "read"],
  accessGrant: ["manage"],
  audit: ["read"],
  recording: ["read"],
  settings: ["update"],
} as const;

export const ac = createAccessControl(statements);

export const owner = ac.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
  server: ["create", "update", "delete", "read", "connect"],
  sshKey: ["create", "deploy", "revoke", "read"],
  accessGrant: ["manage"],
  audit: ["read"],
  recording: ["read"],
  settings: ["update"],
});

export const admin = ac.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["read"],
  server: ["create", "update", "delete", "read", "connect"],
  sshKey: ["create", "deploy", "revoke", "read"],
  accessGrant: ["manage"],
  audit: ["read"],
  recording: ["read"],
  settings: ["update"],
});

export const operator = ac.newRole({
  server: ["create", "update", "delete", "read", "connect"],
  sshKey: ["create", "deploy", "revoke", "read"],
});

export const member = ac.newRole({
  server: ["read", "connect"],
  sshKey: ["read"],
});

export const viewer = ac.newRole({
  server: ["read"],
  sshKey: ["read"],
});

export const roles = { owner, admin, operator, member, viewer };
export type TeamRole = keyof typeof roles;
export const TEAM_ROLES = Object.keys(roles) as TeamRole[];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Besitzer",
  admin: "Admin",
  operator: "Operator",
  member: "Mitglied",
  viewer: "Betrachter",
};

/** Plattform-Rollen (admin plugin) */
export const PLATFORM_ADMIN_ROLE = "superadmin";
export const PLATFORM_USER_ROLE = "user";
