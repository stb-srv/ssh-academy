import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  type AnyPgColumn,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

/**
 * Besitz: Ein Objekt gehört genau einem Nutzer (persönlicher Bereich) ODER einem Team.
 */
const ownership = {
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
};
const ownershipCheck = (name: string) =>
  check(
    `${name}_single_owner`,
    sql`(owner_user_id IS NOT NULL) <> (organization_id IS NOT NULL)`,
  );

// ---------------------------------------------------------------------------
// Pocket ID / OIDC
// ---------------------------------------------------------------------------

/** Zuordnung einer Pocket-ID-Gruppe zu Team-Rolle, Nutzergruppe oder Plattform-Rolle */
export const idpGroupMapping = pgTable(
  "idp_group_mapping",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: text("provider_id").notNull(),
    externalGroup: text("external_group").notNull(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    role: text("role"),
    userGroupId: uuid("user_group_id").references(() => userGroup.id, { onDelete: "cascade" }),
    platformRole: text("platform_role"),
    ...timestamps,
  },
  (t) => [index("idp_group_mapping_lookup_idx").on(t.providerId, t.externalGroup)],
);

/** Merkt sich, welche Rechte der Pocket-ID-Abgleich selbst vergeben hat (nur diese werden wieder entzogen) */
export const idpManagedGrant = pgTable(
  "idp_managed_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    kind: text("kind", { enum: ["membership", "platform_role", "user_group"] }).notNull(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    userGroupId: uuid("user_group_id").references(() => userGroup.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idp_managed_grant_user_idx").on(t.userId, t.providerId)],
);

/** Zuletzt von Pocket ID gemeldete Gruppen (Anzeige „aus Pocket ID“) */
export const idpUserGroups = pgTable(
  "idp_user_groups",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    groups: text("groups").array().notNull().default(sql`'{}'::text[]`),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.providerId] })],
);

// ---------------------------------------------------------------------------
// Nutzergruppen innerhalb eines Teams
// ---------------------------------------------------------------------------

export const userGroup = pgTable(
  "user_group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [uniqueIndex("user_group_org_name_idx").on(t.organizationId, t.name)],
);

export const userGroupMember = pgTable(
  "user_group_member",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => userGroup.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

// ---------------------------------------------------------------------------
// SSH-Keys
// ---------------------------------------------------------------------------

export const sshKeyType = pgEnum("ssh_key_type", ["ed25519", "rsa", "ecdsa", "ed25519-sk", "ecdsa-sk"]);
export const sshKeyStorage = pgEnum("ssh_key_storage", ["download", "vault", "imported"]);

export const sshKey = pgTable(
  "ssh_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...ownership,
    name: text("name").notNull(),
    type: sshKeyType("type").notNull(),
    bits: integer("bits"),
    publicKey: text("public_key").notNull(),
    fingerprintSha256: text("fingerprint_sha256").notNull(),
    comment: text("comment"),
    storageMode: sshKeyStorage("storage_mode").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    ownershipCheck("ssh_key"),
    index("ssh_key_owner_user_idx").on(t.ownerUserId),
    index("ssh_key_org_idx").on(t.organizationId),
    index("ssh_key_fingerprint_idx").on(t.fingerprintSha256),
  ],
);

/**
 * Verschlüsselter Private Key (nur Tresor-Modus). Envelope Encryption:
 * ciphertext = AES-256-GCM(DEK, privateKey); wrappedDek = KMS(KEK, DEK).
 * Diese Tabelle liest ausschließlich das SSH-Gateway.
 */
export const sshKeySecret = pgTable("ssh_key_secret", {
  keyId: uuid("key_id")
    .primaryKey()
    .references(() => sshKey.id, { onDelete: "cascade" }),
  ciphertext: text("ciphertext").notNull(),
  nonce: text("nonce").notNull(),
  authTag: text("auth_tag").notNull(),
  wrappedDek: text("wrapped_dek").notNull(),
  kekVersion: integer("kek_version").notNull(),
  passphraseProtected: boolean("passphrase_protected").notNull().default(false),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export const serverOs = pgEnum("server_os", ["ubuntu", "debian", "other"]);
export const serverStatus = pgEnum("server_status", ["unknown", "online", "offline", "host_key_mismatch"]);

export const server = pgTable(
  "server",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...ownership,
    name: text("name").notNull(),
    host: text("host").notNull(),
    port: integer("port").notNull().default(22),
    defaultUser: text("default_user").notNull().default("root"),
    os: serverOs("os").notNull().default("other"),
    osVersion: text("os_version"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    hostKeyType: text("host_key_type"),
    hostKeyFingerprint: text("host_key_fingerprint"),
    hostKeyConfirmedAt: timestamp("host_key_confirmed_at", { withTimezone: true }),
    hostKeyConfirmedBy: text("host_key_confirmed_by").references(() => user.id, { onDelete: "set null" }),
    status: serverStatus("status").notNull().default("unknown"),
    /** Tresor-Key, mit dem die Plattform als defaultUser Verwaltungsaufgaben erledigt (verteilen, entziehen, Offboarding) */
    managementKeyId: uuid("management_key_id").references((): AnyPgColumn => sshKey.id, { onDelete: "set null" }),
    /** Zertifizierungsstelle, der dieser Server vertraut (Phase 4) */
    trustedCaId: uuid("trusted_ca_id").references((): AnyPgColumn => sshCa.id, { onDelete: "set null" }),
    lastError: text("last_error"),
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    ownershipCheck("server"),
    check("server_port_range", sql`port BETWEEN 1 AND 65535`),
    index("server_owner_user_idx").on(t.ownerUserId),
    index("server_org_idx").on(t.organizationId),
  ],
);

export const serverGroup = pgTable(
  "server_group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [uniqueIndex("server_group_org_name_idx").on(t.organizationId, t.name)],
);

export const serverGroupMember = pgTable(
  "server_group_member",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => serverGroup.id, { onDelete: "cascade" }),
    serverId: uuid("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.serverId] })],
);

// ---------------------------------------------------------------------------
// Zugriffsfreigaben: Wer darf auf welche Server als welcher Linux-Benutzer
// ---------------------------------------------------------------------------

export const accessGrant = pgTable(
  "access_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    subjectType: text("subject_type", { enum: ["user", "user_group"] }).notNull(),
    subjectUserId: text("subject_user_id").references(() => user.id, { onDelete: "cascade" }),
    subjectGroupId: uuid("subject_group_id").references(() => userGroup.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: ["server", "server_group"] }).notNull(),
    targetServerId: uuid("target_server_id").references(() => server.id, { onDelete: "cascade" }),
    targetGroupId: uuid("target_group_id").references(() => serverGroup.id, { onDelete: "cascade" }),
    linuxUser: text("linux_user").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    check(
      "access_grant_subject",
      sql`(subject_type = 'user' AND subject_user_id IS NOT NULL AND subject_group_id IS NULL)
       OR (subject_type = 'user_group' AND subject_group_id IS NOT NULL AND subject_user_id IS NULL)`,
    ),
    check(
      "access_grant_target",
      sql`(target_type = 'server' AND target_server_id IS NOT NULL AND target_group_id IS NULL)
       OR (target_type = 'server_group' AND target_group_id IS NOT NULL AND target_server_id IS NULL)`,
    ),
    index("access_grant_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// Key-Verteilung, Verbindungen, Audit
// ---------------------------------------------------------------------------

export const deploymentStatus = pgEnum("deployment_status", ["pending", "deployed", "removing", "removed", "failed"]);

export const keyDeployment = pgTable(
  "key_deployment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyId: uuid("key_id")
      .notNull()
      .references(() => sshKey.id, { onDelete: "cascade" }),
    serverId: uuid("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    linuxUser: text("linux_user").notNull(),
    status: deploymentStatus("status").notNull().default("pending"),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    lastError: text("last_error"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("key_deployment_unique_idx").on(t.keyId, t.serverId, t.linuxUser)],
);

export const connectionKind = pgEnum("connection_kind", ["terminal", "sftp"]);
export const connectionStatus = pgEnum("connection_status", ["pending", "active", "closed", "failed"]);

/**
 * Eine Browser-Verbindung (Terminal oder SFTP). Die Zeile ist zugleich das Einmal-Token:
 * Die Web-App legt sie mit tokenHash an, das Gateway löst sie genau einmal ein.
 */
export const connectionSession = pgTable(
  "connection_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: connectionKind("kind").notNull().default("terminal"),
    status: connectionStatus("status").notNull().default("pending"),
    tokenHash: text("token_hash").unique(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    serverId: uuid("server_id").references(() => server.id, { onDelete: "set null" }),
    keyId: uuid("key_id").references(() => sshKey.id, { onDelete: "set null" }),
    authMethod: text("auth_method", { enum: ["key", "password", "certificate"] }).notNull().default("key"),
    linuxUser: text("linux_user").notNull(),
    record: boolean("record").notNull().default(false),
    idleTimeoutMinutes: integer("idle_timeout_minutes").notNull().default(15),
    maxDurationMinutes: integer("max_duration_minutes").notNull().default(480),
    clientIp: inet("client_ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"),
    bytesIn: bigint("bytes_in", { mode: "number" }).notNull().default(0),
    bytesOut: bigint("bytes_out", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    index("connection_session_user_idx").on(t.userId),
    index("connection_session_server_idx").on(t.serverId),
    index("connection_session_org_idx").on(t.organizationId, t.createdAt),
  ],
);

/** Aufzeichnung einer Terminal-Sitzung im asciicast-v2-Format, gzip-komprimiert und Base64-kodiert */
export const sessionRecording = pgTable("session_recording", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => connectionSession.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  durationMs: integer("duration_ms").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Append-only Audit-Log. Wird nie aktualisiert, nur nach Aufbewahrungsfrist gelöscht. */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_event_org_created_idx").on(t.organizationId, t.createdAt),
    index("audit_event_actor_idx").on(t.actorId),
  ],
);

// ---------------------------------------------------------------------------
// Team-Einstellungen
// ---------------------------------------------------------------------------

export const teamSettings = pgTable("team_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** Terminal-Sitzungen aufzeichnen (Standard aus; Nutzer sehen einen Hinweis, wenn aktiv) */
  recordSessions: boolean("record_sessions").notNull().default(false),
  idleTimeoutMinutes: integer("idle_timeout_minutes").notNull().default(15),
  maxSessionHours: integer("max_session_hours").notNull().default(8),
  /** Höchste Gültigkeit von Zertifikaten in Minuten */
  maxCertMinutes: integer("max_cert_minutes").notNull().default(60 * 12),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Phase 4: SSH-Zertifizierungsstelle und API-Tokens
// ---------------------------------------------------------------------------

/** Zertifizierungsstelle. Der private Schlüssel ist wie Tresor-Keys versiegelt; nur das Gateway öffnet ihn. */
export const sshCa = pgTable(
  "ssh_ca",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...ownership,
    name: text("name").notNull(),
    publicKey: text("public_key").notNull(),
    fingerprintSha256: text("fingerprint_sha256").notNull(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    authTag: text("auth_tag").notNull(),
    wrappedDek: text("wrapped_dek").notNull(),
    kekVersion: integer("kek_version").notNull(),
    nextSerial: bigint("next_serial", { mode: "bigint" }).notNull().default(sql`1`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [ownershipCheck("ssh_ca"), index("ssh_ca_owner_user_idx").on(t.ownerUserId), index("ssh_ca_org_idx").on(t.organizationId)],
);

export const sshCertificate = pgTable(
  "ssh_certificate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caId: uuid("ca_id")
      .notNull()
      .references(() => sshCa.id, { onDelete: "cascade" }),
    keyId: uuid("key_id").references(() => sshKey.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    serial: bigint("serial", { mode: "bigint" }).notNull(),
    certKeyId: text("cert_key_id").notNull(),
    principals: text("principals").array().notNull(),
    publicKeyFingerprint: text("public_key_fingerprint").notNull(),
    validAfter: timestamp("valid_after", { withTimezone: true }).notNull(),
    validBefore: timestamp("valid_before", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("ssh_certificate_serial_idx").on(t.caId, t.serial), index("ssh_certificate_user_idx").on(t.userId)],
);

export const apiToken = pgTable(
  "api_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Erste Zeichen des Tokens zum Wiedererkennen, z. B. "ssha_3fk2" */
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: text("scopes").array().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("api_token_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Lernbereich
// ---------------------------------------------------------------------------

export const courseProgress = pgTable(
  "course_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonSlug: text("lesson_slug").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
    quizScore: integer("quiz_score"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonSlug] })],
);

// ---------------------------------------------------------------------------
// Relationen
// ---------------------------------------------------------------------------

export const sshKeyRelations = relations(sshKey, ({ one, many }) => ({
  secret: one(sshKeySecret, { fields: [sshKey.id], references: [sshKeySecret.keyId] }),
  deployments: many(keyDeployment),
}));

export const serverRelations = relations(server, ({ many, one }) => ({
  managementKey: one(sshKey, { fields: [server.managementKeyId], references: [sshKey.id] }),
  deployments: many(keyDeployment),
  groups: many(serverGroupMember),
}));

export const keyDeploymentRelations = relations(keyDeployment, ({ one }) => ({
  key: one(sshKey, { fields: [keyDeployment.keyId], references: [sshKey.id] }),
  server: one(server, { fields: [keyDeployment.serverId], references: [server.id] }),
}));

export const serverGroupMemberRelations = relations(serverGroupMember, ({ one }) => ({
  group: one(serverGroup, { fields: [serverGroupMember.groupId], references: [serverGroup.id] }),
  server: one(server, { fields: [serverGroupMember.serverId], references: [server.id] }),
}));

