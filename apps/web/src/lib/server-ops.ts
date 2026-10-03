import "server-only";
import { and, eq, ne, schema } from "@ssh-academy/db";
import { deployKey, revokeKey, type RemoteOp } from "@ssh-academy/ssh/ops";
import type { Credentials, RunResult } from "@ssh-academy/ssh/protocol";
import { connectableKeys, getKeyAccess, keyIsUsable, mayConnectAs, type ServerAccess } from "./access";
import { audit } from "./audit";
import { db } from "./db";
import { runOp } from "./gateway";
import { ActionError } from "./guard";

type Server = typeof schema.server.$inferSelect;

/** Wie sich der Nutzer für eine Aktion am Server anmeldet (aus dem Formular) */
export type OpAuth =
  | { method: "key"; username: string; keyId: string; sudoPassword?: string }
  | { method: "password"; username: string; password: string; sudoPassword?: string }
  | { method: "management"; sudoPassword?: string };

export async function resolveCredentials(userId: string, access: ServerAccess, auth: OpAuth): Promise<Credentials> {
  const server = access.server;
  if (auth.method === "management") {
    if (!access.canManage) throw new ActionError("Nur Verwalter dieses Servers dürfen den Verwaltungs-Key nutzen.");
    if (!server.managementKeyId) throw new ActionError("Für diesen Server ist kein Verwaltungs-Key hinterlegt.");
    return { method: "key", username: server.defaultUser, keyId: server.managementKeyId };
  }
  if (!mayConnectAs(access, auth.username)) throw new ActionError(`Du darfst dich auf diesem Server nicht als ${auth.username} anmelden.`);
  if (auth.method === "password") {
    if (!auth.password) throw new ActionError("Bitte das Passwort eingeben.");
    return { method: "password", username: auth.username, password: auth.password };
  }
  const usable = await connectableKeys(userId, server.id, auth.username);
  if (!usable.some((k) => k.key.id === auth.keyId)) throw new ActionError("Dieser Key ist für diesen Benutzer auf dem Server nicht hinterlegt.");
  return { method: "key", username: auth.username, keyId: auth.keyId };
}

export function resultMessage(result: RunResult) {
  if (result.ok) return result.exitCode === 0 ? null : (result.stderr.trim() || result.stdout.trim() || `Fehlercode ${result.exitCode}`);
  return result.message;
}

/** Fehler zurück in den Server-Status schreiben (z. B. geänderter Host-Key) */
export async function noteServerResult(server: Server, result: RunResult) {
  if (!result.ok && result.error === "HOST_KEY_MISMATCH") {
    await db.update(schema.server).set({ status: "host_key_mismatch", lastError: result.message }).where(eq(schema.server.id, server.id));
  } else if (!result.ok && (result.error === "UNREACHABLE" || result.error === "TIMEOUT")) {
    await db.update(schema.server).set({ status: "offline", lastError: result.message, lastCheckAt: new Date() }).where(eq(schema.server.id, server.id));
  } else if (result.ok) {
    await db.update(schema.server).set({ status: "online", lastError: null, lastCheckAt: new Date() }).where(eq(schema.server.id, server.id));
  }
}

export async function runOnServer(server: Server, credentials: Credentials, op: RemoteOp, opts: { sudoPassword?: string; stdinLines?: string[] } = {}) {
  const result = await runOp(server, credentials, op, opts);
  await noteServerResult(server, result);
  return result;
}

/**
 * Anmeldedaten für automatische Aufgaben (Entziehen, Rotation, Offboarding), ohne Nutzereingabe:
 * 1. ein Tresor-Key, der für genau diesen Linux-Benutzer auf dem Server liegt (auch der zu entfernende selbst),
 * 2. der Verwaltungs-Key des Servers (als defaultUser, mit root bzw. sudo ohne Passwort).
 */
async function automaticCredentials(server: Server, linuxUser: string, preferKeyId?: string) {
  const deployed = await db
    .select({ key: schema.sshKey })
    .from(schema.keyDeployment)
    .innerJoin(schema.sshKey, eq(schema.sshKey.id, schema.keyDeployment.keyId))
    .where(
      and(
        eq(schema.keyDeployment.serverId, server.id),
        eq(schema.keyDeployment.linuxUser, linuxUser),
        eq(schema.keyDeployment.status, "deployed"),
        eq(schema.sshKey.storageMode, "vault"),
      ),
    );
  const usable = deployed.map((d) => d.key).filter(keyIsUsable);
  const own = usable.find((k) => k.id === preferKeyId) ?? usable[0];
  if (own) return { credentials: { method: "key", username: linuxUser, keyId: own.id } as Credentials, asRoot: false };
  if (server.managementKeyId) {
    return { credentials: { method: "key", username: server.defaultUser, keyId: server.managementKeyId } as Credentials, asRoot: linuxUser !== server.defaultUser };
  }
  return null;
}

type DeployInput = {
  server: Server;
  key: typeof schema.sshKey.$inferSelect;
  linuxUser: string;
  actorId: string;
  /** Interaktive Anmeldung aus dem Formular; ohne sie wird automatisch gewählt */
  credentials?: Credentials;
  sudoPassword?: string;
};

export async function deployKeyToServer(input: DeployInput) {
  const { server, key, linuxUser, actorId } = input;
  let credentials = input.credentials;
  let asRoot = credentials ? credentials.username !== linuxUser : false;
  if (!credentials) {
    const auto = await automaticCredentials(server, linuxUser);
    if (!auto) return { ok: false as const, error: "Keine automatische Anmeldung möglich. Bitte mit Passwort oder Key verteilen." };
    ({ credentials, asRoot } = auto);
  }
  const op = deployKey({ user: linuxUser, publicKeyLine: key.publicKey, asRoot });
  const result = await runOnServer(server, credentials, op, { sudoPassword: input.sudoPassword });
  const error = resultMessage(result);
  const values = {
    keyId: key.id,
    serverId: server.id,
    linuxUser,
    status: (error ? "failed" : "deployed") as "failed" | "deployed",
    deployedAt: error ? null : new Date(),
    removedAt: null,
    lastError: error,
    requestedBy: actorId,
  };
  await db
    .insert(schema.keyDeployment)
    .values(values)
    .onConflictDoUpdate({ target: [schema.keyDeployment.keyId, schema.keyDeployment.serverId, schema.keyDeployment.linuxUser], set: values });

  // Prüfen, ob die Anmeldung mit dem neuen Key wirklich klappt (nur bei Tresor-Keys möglich)
  let verified: boolean | null = null;
  if (!error && key.storageMode === "vault") {
    const check = await runOp(server, { method: "key", username: linuxUser, keyId: key.id }, { title: "Test", needsRoot: false, script: "true" });
    verified = check.ok && check.exitCode === 0;
  }
  await audit({
    action: error ? "key.deploy_failed" : "key.deployed",
    actorId,
    organizationId: server.organizationId ?? key.organizationId,
    targetType: "server",
    targetId: server.id,
    metadata: { keyId: key.id, fingerprint: key.fingerprintSha256, linuxUser, error, verified, output: result.ok ? result.stdout.trim() : undefined },
  });
  // Erster Tresor-Key für den Standard-Benutzer wird Verwaltungs-Key, wenn noch keiner gesetzt ist
  if (!error && verified && !server.managementKeyId && linuxUser === server.defaultUser && sameOwner(server, key)) {
    await db.update(schema.server).set({ managementKeyId: key.id }).where(eq(schema.server.id, server.id));
  }
  return error ? { ok: false as const, error } : { ok: true as const, verified, output: result.ok ? result.stdout.trim() : "" };
}

function sameOwner(server: Server, key: typeof schema.sshKey.$inferSelect) {
  return (server.ownerUserId && server.ownerUserId === key.ownerUserId) || (server.organizationId && server.organizationId === key.organizationId);
}

export async function revokeDeployment(deploymentId: string, actorId: string, interactive?: { credentials: Credentials; sudoPassword?: string }) {
  const [row] = await db
    .select({ d: schema.keyDeployment, key: schema.sshKey, server: schema.server })
    .from(schema.keyDeployment)
    .innerJoin(schema.sshKey, eq(schema.sshKey.id, schema.keyDeployment.keyId))
    .innerJoin(schema.server, eq(schema.server.id, schema.keyDeployment.serverId))
    .where(eq(schema.keyDeployment.id, deploymentId));
  if (!row) return { ok: false as const, error: "Verteilung nicht gefunden." };
  const { d, key, server } = row;

  let credentials = interactive?.credentials;
  let asRoot = credentials ? credentials.username !== d.linuxUser : false;
  if (!credentials) {
    const auto = await automaticCredentials(server, d.linuxUser, key.id);
    if (!auto) {
      const error = `Keine automatische Anmeldung möglich. Bitte auf dem Server die Zeile mit ${key.fingerprintSha256} aus ~${d.linuxUser}/.ssh/authorized_keys löschen.`;
      await db.update(schema.keyDeployment).set({ status: "failed", lastError: error }).where(eq(schema.keyDeployment.id, d.id));
      return { ok: false as const, error };
    }
    ({ credentials, asRoot } = auto);
  }
  await db.update(schema.keyDeployment).set({ status: "removing" }).where(eq(schema.keyDeployment.id, d.id));
  const result = await runOnServer(server, credentials, revokeKey({ user: d.linuxUser, publicKeyLine: key.publicKey, asRoot }), {
    sudoPassword: interactive?.sudoPassword,
  });
  const error = resultMessage(result);
  await db
    .update(schema.keyDeployment)
    .set(error ? { status: "failed", lastError: `Entfernen fehlgeschlagen: ${error}` } : { status: "removed", removedAt: new Date(), lastError: null })
    .where(eq(schema.keyDeployment.id, d.id));
  // Wurde der Verwaltungs-Key entfernt, kann die Plattform ihn nicht mehr nutzen
  if (!error && server.managementKeyId === key.id && d.linuxUser === server.defaultUser) {
    await db.update(schema.server).set({ managementKeyId: null }).where(eq(schema.server.id, server.id));
  }
  await audit({
    action: error ? "key.revoke_failed" : "key.revoked_from_server",
    actorId,
    organizationId: server.organizationId ?? key.organizationId,
    targetType: "server",
    targetId: server.id,
    metadata: { keyId: key.id, fingerprint: key.fingerprintSha256, linuxUser: d.linuxUser, error },
  });
  return error ? { ok: false as const, error } : { ok: true as const };
}

/** Alle aktiven Verteilungen eines Keys entfernen (Widerruf, Rotation, Offboarding) */
export async function revokeAllDeployments(keyId: string, actorId: string, onlyOrganizationId?: string) {
  const rows = await db
    .select({ id: schema.keyDeployment.id, organizationId: schema.server.organizationId, serverName: schema.server.name, linuxUser: schema.keyDeployment.linuxUser })
    .from(schema.keyDeployment)
    .innerJoin(schema.server, eq(schema.server.id, schema.keyDeployment.serverId))
    .where(and(eq(schema.keyDeployment.keyId, keyId), ne(schema.keyDeployment.status, "removed")));
  const results = [];
  for (const r of rows) {
    if (onlyOrganizationId && r.organizationId !== onlyOrganizationId) continue;
    results.push({ server: r.serverName, linuxUser: r.linuxUser, ...(await revokeDeployment(r.id, actorId)) });
  }
  return results;
}

export async function assertKeyManageable(userId: string, keyId: string) {
  const access = await getKeyAccess(userId, keyId);
  if (!access) throw new ActionError("Key nicht gefunden.");
  if (!access.canManage) throw new ActionError("Du darfst diesen Key nicht verwalten.");
  return access.key;
}
