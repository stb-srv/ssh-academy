"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, schema } from "@ssh-academy/db";
import { isValidHost } from "@ssh-academy/ssh/net";
import {
  allowPasswordlessSudo,
  applySshdConfig,
  checkPrivileges,
  createUser,
  detectOs,
  isValidLinuxUser,
  parseOsOutput,
  parsePrivileges,
  setUserPassword,
} from "@ssh-academy/ssh/ops";
import { buildSshdConfig, DEFAULT_SSHD_OPTIONS } from "@ssh-academy/ssh/sshd-config";
import { z } from "zod";
import { getKeyAccess, getServerAccess, getTeamSettings, keyIsUsable, mayConnectAs, resolveOwner } from "@/lib/access";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { gatewayWebSocketUrl } from "@/lib/env";
import { runOp, scanHostKey } from "@/lib/gateway";
import { ActionError, requireStrongSession, runAction } from "@/lib/guard";
import { parseOpAuth } from "@/lib/op-auth";
import { requestMeta } from "@/lib/request";
import { deployKeyToServer, resolveCredentials, resultMessage, revokeDeployment, runOnServer } from "@/lib/server-ops";

async function serverFor(userId: string, serverId: string, need: "read" | "manage" | "connect") {
  const access = await getServerAccess(userId, serverId);
  if (!access) throw new ActionError("Server nicht gefunden.");
  if (need === "manage" && !access.canManage) throw new ActionError("Du darfst diesen Server nicht verwalten.");
  if (need === "connect" && !access.canConnect) throw new ActionError("Du hast keine Freigabe für diesen Server.");
  return access;
}

function revalidateServer(id: string) {
  revalidatePath(`/dashboard/server/${id}`);
  revalidatePath("/dashboard/server");
}

const serverInput = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(80),
  host: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidHost, "Bitte einen gültigen Hostnamen oder eine IP-Adresse angeben."),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  defaultUser: z.string().trim().refine(isValidLinuxUser, "Ungültiger Linux-Benutzername."),
  tags: z
    .string()
    .optional()
    .transform((v) => (v ? [...new Set(v.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 10) : [])),
  owner: z.string().default("personal"),
});

export async function addServer(_prev: unknown, form: FormData) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const data = serverInput.parse(Object.fromEntries(form));
    const owner = await resolveOwner(session.user.id, data.owner, { server: ["create"] });
    if (!owner) throw new ActionError("Du darfst in diesem Team keine Server anlegen.");

    const scan = await scanHostKey(data.host, data.port);
    if (!scan.ok) throw new ActionError(scan.message);
    const [row] = await db
      .insert(schema.server)
      .values({
        ...owner,
        name: data.name,
        host: data.host,
        port: data.port,
        defaultUser: data.defaultUser,
        tags: data.tags,
        hostKeyType: scan.algorithm,
        hostKeyFingerprint: scan.fingerprint,
        status: "online",
        lastCheckAt: new Date(),
        createdBy: session.user.id,
      })
      .returning({ id: schema.server.id });
    await audit({
      action: "server.created",
      actorId: session.user.id,
      organizationId: owner.organizationId,
      targetType: "server",
      targetId: row!.id,
      ...(await requestMeta()),
      metadata: { host: data.host, port: data.port, fingerprint: scan.fingerprint },
    });
    revalidatePath("/dashboard/server");
    return { id: row!.id };
  });
}

export async function updateServer(serverId: string, _prev: unknown, form: FormData) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const access = await serverFor(session.user.id, serverId, "manage");
    const data = serverInput.omit({ owner: true, host: true }).parse(Object.fromEntries(form));
    const portChanged = data.port !== access.server.port;
    await db
      .update(schema.server)
      .set({ name: data.name, port: data.port, defaultUser: data.defaultUser, tags: data.tags, ...(portChanged ? { hostKeyConfirmedAt: null } : {}) })
      .where(eq(schema.server.id, serverId));
    await audit({ action: "server.updated", actorId: session.user.id, organizationId: access.server.organizationId, targetType: "server", targetId: serverId, metadata: data });
    revalidateServer(serverId);
    return {};
  });
}

/** Fingerprint bestätigen: erst danach sind Verbindungen möglich */
export async function confirmHostKey(serverId: string, fingerprint: string) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const access = await serverFor(session.user.id, serverId, "manage");
    if (access.server.hostKeyFingerprint !== fingerprint) throw new ActionError("Der Fingerprint hat sich inzwischen geändert. Bitte neu prüfen.");
    await db
      .update(schema.server)
      .set({ hostKeyConfirmedAt: new Date(), hostKeyConfirmedBy: session.user.id, status: "online", lastError: null })
      .where(eq(schema.server.id, serverId));
    await audit({
      action: "server.host_key_confirmed",
      actorId: session.user.id,
      organizationId: access.server.organizationId,
      targetType: "server",
      targetId: serverId,
      ...(await requestMeta()),
      metadata: { fingerprint },
    });
    revalidateServer(serverId);
    return {};
  });
}

/** Host-Key und Erreichbarkeit prüfen. Ein geänderter Key muss neu bestätigt werden. */
export async function checkServer(serverId: string) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const access = await serverFor(session.user.id, serverId, "read");
    const s = access.server;
    const scan = await scanHostKey(s.host, s.port);
    if (!scan.ok) {
      await db.update(schema.server).set({ status: "offline", lastError: scan.message, lastCheckAt: new Date() }).where(eq(schema.server.id, serverId));
      revalidateServer(serverId);
      return { status: "offline" as const, message: scan.message };
    }
    const changed = s.hostKeyFingerprint !== scan.fingerprint;
    if (changed && s.hostKeyConfirmedAt) {
      // Nicht automatisch übernehmen: der neue Key wird als „unbestätigt“ gespeichert
      await db
        .update(schema.server)
        .set({
          status: "host_key_mismatch",
          hostKeyFingerprint: scan.fingerprint,
          hostKeyType: scan.algorithm,
          hostKeyConfirmedAt: null,
          lastError: `Host-Key geändert. Vorher: ${s.hostKeyFingerprint}`,
          lastCheckAt: new Date(),
        })
        .where(eq(schema.server.id, serverId));
      await audit({
        action: "server.host_key_mismatch",
        actorId: session.user.id,
        organizationId: s.organizationId,
        targetType: "server",
        targetId: serverId,
        metadata: { old: s.hostKeyFingerprint, new: scan.fingerprint },
      });
    } else {
      await db
        .update(schema.server)
        .set({
          status: changed ? "unknown" : "online",
          hostKeyFingerprint: scan.fingerprint,
          hostKeyType: scan.algorithm,
          lastError: null,
          lastCheckAt: new Date(),
        })
        .where(eq(schema.server.id, serverId));
    }
    revalidateServer(serverId);
    return { status: changed ? ("changed" as const) : ("online" as const), message: scan.banner ? `Erreichbar (${scan.banner})` : "Erreichbar" };
  });
}

export async function deleteServer(serverId: string) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const access = await serverFor(session.user.id, serverId, "manage");
    await db.delete(schema.server).where(eq(schema.server.id, serverId));
    await audit({
      action: "server.deleted",
      actorId: session.user.id,
      organizationId: access.server.organizationId,
      targetType: "server",
      targetId: serverId,
      ...(await requestMeta()),
      metadata: { name: access.server.name, host: access.server.host },
    });
    revalidatePath("/dashboard/server");
    return {};
  });
}

export async function setManagementKey(serverId: string, keyId: string | null) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const access = await serverFor(session.user.id, serverId, "manage");
    if (keyId) {
      const key = await getKeyAccess(session.user.id, keyId);
      if (!key?.canUse || key.key.storageMode !== "vault" || !keyIsUsable(key.key)) throw new ActionError("Nur eigene, gültige Tresor-Keys sind möglich.");
      const [dep] = await db
        .select()
        .from(schema.keyDeployment)
        .where(
          and(
            eq(schema.keyDeployment.keyId, keyId),
            eq(schema.keyDeployment.serverId, serverId),
            eq(schema.keyDeployment.linuxUser, access.server.defaultUser),
            eq(schema.keyDeployment.status, "deployed"),
          ),
        );
      if (!dep) throw new ActionError(`Der Key muss zuerst für ${access.server.defaultUser} auf dem Server hinterlegt sein.`);
    }
    await db.update(schema.server).set({ managementKeyId: keyId }).where(eq(schema.server.id, serverId));
    await audit({ action: "server.management_key_set", actorId: session.user.id, organizationId: access.server.organizationId, targetType: "server", targetId: serverId, metadata: { keyId } });
    revalidateServer(serverId);
    return {};
  });
}

// ---------------------------------------------------------------------------
// Keys verteilen und entziehen
// ---------------------------------------------------------------------------

export async function deployKeyAction(serverId: string, _prev: unknown, form: FormData) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const access = await serverFor(session.user.id, serverId, "connect");
    const keyId = String(form.get("keyId") ?? "");
    const linuxUser = String(form.get("linuxUser") ?? "").trim();
    if (!isValidLinuxUser(linuxUser)) throw new ActionError("Bitte einen gültigen Linux-Benutzer angeben.");

    const key = await getKeyAccess(session.user.id, keyId);
    if (!key || !keyIsUsable(key.key)) throw new ActionError("Key nicht gefunden oder gesperrt.");
    // Verwalter dürfen beliebige Keys verteilen; Mitglieder nur eigene Keys für freigegebene Benutzer
    if (!access.canManage && !(key.key.ownerUserId === session.user.id && mayConnectAs(access, linuxUser))) {
      throw new ActionError("Du darfst nur deine eigenen Keys für freigegebene Benutzer hinterlegen.");
    }
    if (access.canManage && !key.canManage) throw new ActionError("Du darfst diesen Key nicht verteilen.");

    const auth = parseOpAuth(form);
    const credentials = await resolveCredentials(session.user.id, access, auth);
    const result = await deployKeyToServer({ server: access.server, key: key.key, linuxUser, actorId: session.user.id, credentials, sudoPassword: auth.sudoPassword });
    revalidateServer(serverId);
    revalidatePath(`/dashboard/keys/${keyId}`);
    if (!result.ok) throw new ActionError(result.error);
    return { message: result.verified === false ? "Eingetragen, aber die Test-Anmeldung mit dem Key ist fehlgeschlagen." : result.verified ? "Eingetragen und Anmeldung erfolgreich getestet." : "Eingetragen." };
  });
}

export async function removeDeploymentAction(deploymentId: string, form?: FormData) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const [dep] = await db.select().from(schema.keyDeployment).where(eq(schema.keyDeployment.id, deploymentId));
    if (!dep) throw new ActionError("Nicht gefunden.");
    const access = await serverFor(session.user.id, dep.serverId, "connect");
    const key = await getKeyAccess(session.user.id, dep.keyId);
    if (!access.canManage && key?.key.ownerUserId !== session.user.id) throw new ActionError("Du darfst diesen Eintrag nicht entfernen.");
    let interactive;
    if (form && form.get("auth")) {
      const auth = parseOpAuth(form);
      interactive = { credentials: await resolveCredentials(session.user.id, access, auth), sudoPassword: auth.sudoPassword };
    }
    const result = await revokeDeployment(deploymentId, session.user.id, interactive);
    revalidateServer(dep.serverId);
    revalidatePath(`/dashboard/keys/${dep.keyId}`);
    if (!result.ok) throw new ActionError(result.error);
    return {};
  });
}

export async function detectServerOs(serverId: string, form: FormData) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const access = await serverFor(session.user.id, serverId, "connect");
    const credentials = await resolveCredentials(session.user.id, access, parseOpAuth(form));
    const result = await runOnServer(access.server, credentials, detectOs());
    const error = resultMessage(result);
    if (error || !result.ok) throw new ActionError(error ?? "Fehler");
    const os = parseOsOutput(result.stdout);
    await db.update(schema.server).set({ os: os.os, osVersion: os.pretty }).where(eq(schema.server.id, serverId));
    revalidateServer(serverId);
    return { os };
  });
}

// ---------------------------------------------------------------------------
// Benutzer-Assistent (Ubuntu/Debian)
// ---------------------------------------------------------------------------

const wizardBase = z.object({ serverId: z.uuid() });

async function wizardContext(input: Record<string, unknown>) {
  const session = await requireStrongSession();
  const { serverId } = wizardBase.parse(input);
  const access = await serverFor(session.user.id, serverId, "manage");
  const auth = parseOpAuth(input);
  const credentials = await resolveCredentials(session.user.id, access, auth);
  return { session, access, credentials, sudoPassword: auth.sudoPassword };
}

function stepResult(result: Awaited<ReturnType<typeof runOp>>) {
  const error = resultMessage(result);
  if (error) throw new ActionError(error);
  return { output: result.ok ? [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n") : "" };
}

/** Schritt 1: Verbindung testen, System und Rechte erkennen */
export async function wizardCheck(input: Record<string, unknown>) {
  return runAction(async () => {
    const { access, credentials } = await wizardContext(input);
    const osResult = await runOnServer(access.server, credentials, detectOs());
    const out = stepResult(osResult);
    const os = parseOsOutput(osResult.ok ? osResult.stdout : "");
    await db.update(schema.server).set({ os: os.os, osVersion: os.pretty }).where(eq(schema.server.id, access.server.id));
    const privResult = await runOnServer(access.server, credentials, checkPrivileges());
    const priv = parsePrivileges(privResult.ok ? privResult.stdout : "");
    return { os, privileges: priv, output: out.output };
  });
}

export async function wizardCreateUser(input: Record<string, unknown>) {
  return runAction(async () => {
    const { session, access, credentials, sudoPassword } = await wizardContext(input);
    const user = String(input.newUser ?? "");
    const sudo = input.sudo === true || input.sudo === "true";
    if (!isValidLinuxUser(user) || user === "root") throw new ActionError("Bitte einen gültigen Benutzernamen (nicht root) angeben.");
    const out = stepResult(await runOnServer(access.server, credentials, createUser({ user, sudo }), { sudoPassword }));
    await audit({ action: "server.user_created", actorId: session.user.id, organizationId: access.server.organizationId, targetType: "server", targetId: access.server.id, metadata: { user, sudo } });
    return out;
  });
}

export async function wizardSudoAccess(input: Record<string, unknown>) {
  return runAction(async () => {
    const { session, access, credentials, sudoPassword } = await wizardContext(input);
    const user = String(input.newUser ?? "");
    const mode = String(input.sudoMode ?? "");
    if (!isValidLinuxUser(user)) throw new ActionError("Ungültiger Benutzer.");
    let out;
    if (mode === "password") {
      const pw = String(input.newPassword ?? "");
      if (pw.length < 12) throw new ActionError("Das Passwort muss mindestens 12 Zeichen haben.");
      if (/[\r\n]/.test(pw)) throw new ActionError("Das Passwort darf keinen Zeilenumbruch enthalten.");
      out = stepResult(await runOnServer(access.server, credentials, setUserPassword({ user }), { sudoPassword, stdinLines: [pw] }));
    } else if (mode === "nopasswd") {
      out = stepResult(await runOnServer(access.server, credentials, allowPasswordlessSudo({ user }), { sudoPassword }));
    } else throw new ActionError("Bitte eine Variante wählen.");
    await audit({ action: "server.user_sudo_configured", actorId: session.user.id, organizationId: access.server.organizationId, targetType: "server", targetId: access.server.id, metadata: { user, mode } });
    return out;
  });
}

export async function wizardDeployKey(input: Record<string, unknown>) {
  return runAction(async () => {
    const { session, access, credentials, sudoPassword } = await wizardContext(input);
    const user = String(input.newUser ?? "");
    const key = await getKeyAccess(session.user.id, String(input.keyId ?? ""));
    if (!key?.canManage || !keyIsUsable(key.key)) throw new ActionError("Bitte einen gültigen eigenen Key wählen.");
    const result = await deployKeyToServer({ server: access.server, key: key.key, linuxUser: user, actorId: session.user.id, credentials, sudoPassword });
    revalidateServer(access.server.id);
    if (!result.ok) throw new ActionError(result.error);
    return { output: result.output, verified: result.verified };
  });
}

/** Prüft die Anmeldung als neuer Benutzer mit einem Tresor-Key und ob sudo funktioniert */
export async function wizardTestLogin(input: Record<string, unknown>) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const { serverId } = wizardBase.parse(input);
    const access = await serverFor(session.user.id, serverId, "manage");
    const user = String(input.newUser ?? "");
    const keyId = String(input.keyId ?? "");
    const key = await getKeyAccess(session.user.id, keyId);
    if (!key?.canUse || key.key.storageMode !== "vault") throw new ActionError("Automatisch testen geht nur mit einem Tresor-Key.");
    const result = await runOnServer(access.server, { method: "key", username: user, keyId }, checkPrivileges());
    const error = resultMessage(result);
    if (error || !result.ok) throw new ActionError(`Anmeldung als ${user} fehlgeschlagen: ${error}`);
    const priv = parsePrivileges(result.stdout);
    return { privileges: priv, output: result.stdout.trim() };
  });
}

export async function wizardHarden(input: Record<string, unknown>) {
  return runAction(async () => {
    const { session, access, credentials, sudoPassword } = await wizardContext(input);
    const disableRoot = input.disableRoot === true || input.disableRoot === "true";
    const disablePassword = input.disablePassword === true || input.disablePassword === "true";
    if (input.confirmed !== true && input.confirmed !== "true") throw new ActionError("Bitte bestätige, dass die Anmeldung mit dem neuen Benutzer funktioniert.");
    const { config } = buildSshdConfig({
      ...DEFAULT_SSHD_OPTIONS,
      port: access.server.port,
      rootLogin: disableRoot ? "no" : "prohibit-password",
      passwordAuth: !disablePassword,
      tcpForwarding: true,
      modernCrypto: false,
    });
    const out = stepResult(await runOnServer(access.server, credentials, applySshdConfig({ config }), { sudoPassword }));
    await audit({
      action: "server.sshd_hardened",
      actorId: session.user.id,
      organizationId: access.server.organizationId,
      targetType: "server",
      targetId: access.server.id,
      ...(await requestMeta()),
      metadata: { disableRoot, disablePassword },
    });
    // Wer bisher als root verwaltet hat, nutzt ab jetzt den neuen Benutzer
    const newUser = String(input.newUser ?? "");
    if (disableRoot && access.server.defaultUser === "root" && isValidLinuxUser(newUser)) {
      await db.update(schema.server).set({ defaultUser: newUser, managementKeyId: null }).where(eq(schema.server.id, access.server.id));
    }
    revalidateServer(access.server.id);
    return { ...out, config };
  });
}

// ---------------------------------------------------------------------------
// Web-Terminal und SFTP: Einmal-Token für das Gateway
// ---------------------------------------------------------------------------

export async function createConnection(input: { serverId: string; kind: "terminal" | "sftp"; linuxUser: string; keyId?: string }) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const access = await serverFor(session.user.id, input.serverId, "connect");
    const s = access.server;
    if (!s.hostKeyConfirmedAt) throw new ActionError("Bitte zuerst den Fingerprint des Servers bestätigen.");
    if (!isValidLinuxUser(input.linuxUser) || !mayConnectAs(access, input.linuxUser)) throw new ActionError(`Keine Freigabe für ${input.linuxUser}.`);
    if (input.keyId) {
      const key = await getKeyAccess(session.user.id, input.keyId);
      if (!key?.canUse || key.key.storageMode !== "vault" || !keyIsUsable(key.key)) throw new ActionError("Dieser Key kann nicht genutzt werden.");
    }
    const settings = s.organizationId ? await getTeamSettings(s.organizationId) : null;
    const token = randomBytes(32).toString("base64url");
    const meta = await requestMeta();
    await db.insert(schema.connectionSession).values({
      kind: input.kind,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      tokenExpiresAt: new Date(Date.now() + 60_000),
      userId: session.user.id,
      organizationId: s.organizationId,
      serverId: s.id,
      keyId: input.keyId ?? null,
      authMethod: input.keyId ? "key" : "password",
      linuxUser: input.linuxUser,
      record: input.kind === "terminal" && Boolean(settings?.recordSessions),
      idleTimeoutMinutes: settings?.idleTimeoutMinutes ?? 15,
      maxDurationMinutes: (settings?.maxSessionHours ?? 8) * 60,
      clientIp: meta.ip && /^[0-9a-fA-F:.]+$/.test(meta.ip) ? meta.ip : null,
    });
    return { token, url: gatewayWebSocketUrl(), recorded: input.kind === "terminal" && Boolean(settings?.recordSessions) };
  });
}
