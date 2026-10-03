"use server";
import { revalidatePath } from "next/cache";
import { and, eq, ne, schema } from "@ssh-academy/db";
import { parsePublicKey, PublicKeyError } from "@ssh-academy/ssh/keys";
import type { SealedSecret } from "@ssh-academy/ssh/vault";
import { z } from "zod";
import { resolveOwner } from "@/lib/access";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getVaultPublicKey } from "@/lib/gateway";
import { ActionError, requireActionSession, requireStrongSession, runAction } from "@/lib/guard";
import { requestMeta } from "@/lib/request";
import { assertKeyManageable, deployKeyToServer, revokeAllDeployments } from "@/lib/server-ops";

const base64 = z.string().regex(/^[A-Za-z0-9+/=]+$/).max(20_000);

const keyInput = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(80),
  owner: z.string().default("personal"),
  publicKey: z.string().max(20_000),
  expiresAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => !d || (!Number.isNaN(d.getTime()) && d > new Date()), "Das Ablaufdatum muss in der Zukunft liegen."),
});

const sealedSchema = z.object({
  ciphertext: base64,
  nonce: base64,
  authTag: base64,
  wrappedDek: base64,
  kekVersion: z.number().int().positive(),
});

async function parseKey(publicKey: string) {
  try {
    return await parsePublicKey(publicKey);
  } catch (e) {
    if (e instanceof PublicKeyError) throw new ActionError(e.message);
    throw e;
  }
}

async function assertNotDuplicate(fingerprint: string, owner: { ownerUserId: string | null; organizationId: string | null }) {
  const existing = await db
    .select({ name: schema.sshKey.name })
    .from(schema.sshKey)
    .where(
      and(
        eq(schema.sshKey.fingerprintSha256, fingerprint),
        owner.ownerUserId ? eq(schema.sshKey.ownerUserId, owner.ownerUserId) : eq(schema.sshKey.organizationId, owner.organizationId!),
      ),
    );
  if (existing.length) throw new ActionError(`Diesen Key gibt es hier schon (${existing[0]!.name}).`);
}

/** Speichert einen im Browser erzeugten Key. Im Tresor-Modus kommt der Private Key nur versiegelt an. */
export async function createKey(input: z.input<typeof keyInput> & { mode: "download" | "vault"; sealed?: SealedSecret }) {
  return runAction(async () => {
    const session = input.mode === "vault" ? await requireStrongSession() : await requireActionSession();
    const data = keyInput.parse(input);
    const owner = await resolveOwner(session.user.id, data.owner, { sshKey: ["create"] });
    if (!owner) throw new ActionError("Du darfst in diesem Team keine Keys anlegen.");
    const parsed = await parseKey(data.publicKey);
    if (parsed.type.endsWith("-sk")) throw new ActionError("Hardware-Keys entstehen nur lokal. Bitte über „Importieren“ hinzufügen.");
    await assertNotDuplicate(parsed.fingerprint, owner);

    let sealed: SealedSecret | null = null;
    if (input.mode === "vault") {
      sealed = sealedSchema.parse(input.sealed);
      const vault = await getVaultPublicKey();
      if (sealed.kekVersion !== vault.version) throw new ActionError("Der Tresor-Schlüssel hat sich geändert. Bitte die Seite neu laden.");
    }

    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.sshKey)
        .values({
          ...owner,
          name: data.name,
          type: parsed.type,
          bits: parsed.bits,
          publicKey: parsed.line,
          fingerprintSha256: parsed.fingerprint,
          comment: parsed.comment || null,
          storageMode: input.mode,
          expiresAt: data.expiresAt,
          createdBy: session.user.id,
        })
        .returning({ id: schema.sshKey.id });
      if (sealed) await tx.insert(schema.sshKeySecret).values({ keyId: row!.id, ...sealed });
      return row!.id;
    });
    const meta = await requestMeta();
    await audit({
      action: "key.created",
      actorId: session.user.id,
      organizationId: owner.organizationId,
      targetType: "ssh_key",
      targetId: id,
      ...meta,
      metadata: { fingerprint: parsed.fingerprint, type: parsed.type, mode: input.mode },
    });
    revalidatePath("/dashboard/keys");
    return { id };
  });
}

export async function importKey(input: z.input<typeof keyInput>) {
  return runAction(async () => {
    const session = await requireActionSession();
    const data = keyInput.parse(input);
    const owner = await resolveOwner(session.user.id, data.owner, { sshKey: ["create"] });
    if (!owner) throw new ActionError("Du darfst in diesem Team keine Keys anlegen.");
    const parsed = await parseKey(data.publicKey);
    await assertNotDuplicate(parsed.fingerprint, owner);
    const [row] = await db
      .insert(schema.sshKey)
      .values({
        ...owner,
        name: data.name,
        type: parsed.type,
        bits: parsed.bits,
        publicKey: parsed.line,
        fingerprintSha256: parsed.fingerprint,
        comment: parsed.comment || null,
        storageMode: "imported",
        expiresAt: data.expiresAt,
        createdBy: session.user.id,
      })
      .returning({ id: schema.sshKey.id });
    await audit({
      action: "key.imported",
      actorId: session.user.id,
      organizationId: owner.organizationId,
      targetType: "ssh_key",
      targetId: row!.id,
      ...(await requestMeta()),
      metadata: { fingerprint: parsed.fingerprint, type: parsed.type },
    });
    revalidatePath("/dashboard/keys");
    return { id: row!.id };
  });
}

export async function renameKey(keyId: string, name: string) {
  return runAction(async () => {
    const session = await requireActionSession();
    await assertKeyManageable(session.user.id, keyId);
    const clean = z.string().trim().min(1).max(80).parse(name);
    await db.update(schema.sshKey).set({ name: clean }).where(eq(schema.sshKey.id, keyId));
    revalidatePath(`/dashboard/keys/${keyId}`);
    return {};
  });
}

/** Key sperren: von allen Servern entfernen und für Verbindungen sperren */
export async function revokeKey(keyId: string) {
  return runAction(async () => {
    const session = await requireActionSession();
    const key = await assertKeyManageable(session.user.id, keyId);
    const results = await revokeAllDeployments(keyId, session.user.id);
    await db.update(schema.sshKey).set({ revokedAt: new Date() }).where(eq(schema.sshKey.id, keyId));
    // Den Private Key aus dem Tresor löschen: ein gesperrter Key wird nie wieder gebraucht
    await db.delete(schema.sshKeySecret).where(eq(schema.sshKeySecret.keyId, keyId));
    await audit({
      action: "key.revoked",
      actorId: session.user.id,
      organizationId: key.organizationId,
      targetType: "ssh_key",
      targetId: keyId,
      ...(await requestMeta()),
      metadata: { fingerprint: key.fingerprintSha256, servers: results.length, failed: results.filter((r) => !r.ok).length },
    });
    revalidatePath(`/dashboard/keys/${keyId}`);
    revalidatePath("/dashboard/keys");
    return { results };
  });
}

export async function deleteKey(keyId: string) {
  return runAction(async () => {
    const session = await requireActionSession();
    const key = await assertKeyManageable(session.user.id, keyId);
    const active = await db
      .select({ id: schema.keyDeployment.id })
      .from(schema.keyDeployment)
      .where(and(eq(schema.keyDeployment.keyId, keyId), ne(schema.keyDeployment.status, "removed")));
    if (active.length) throw new ActionError("Der Key ist noch auf Servern eingetragen. Sperre ihn zuerst, damit er dort entfernt wird.");
    await db.delete(schema.sshKey).where(eq(schema.sshKey.id, keyId));
    await audit({
      action: "key.deleted",
      actorId: session.user.id,
      organizationId: key.organizationId,
      targetType: "ssh_key",
      targetId: keyId,
      ...(await requestMeta()),
      metadata: { fingerprint: key.fingerprintSha256, name: key.name },
    });
    revalidatePath("/dashboard/keys");
    return {};
  });
}

/**
 * Rotation: Der neue Key wird überall dort eingetragen, wo der alte liegt, danach wird der alte
 * entfernt und gesperrt. Server, auf denen das Eintragen scheitert, behalten den alten Key.
 */
export async function rotateKey(oldKeyId: string, newKeyId: string) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const oldKey = await assertKeyManageable(session.user.id, oldKeyId);
    const newKey = await assertKeyManageable(session.user.id, newKeyId);
    if (oldKey.id === newKey.id) throw new ActionError("Alter und neuer Key sind identisch.");

    const deployments = await db
      .select({ d: schema.keyDeployment, server: schema.server })
      .from(schema.keyDeployment)
      .innerJoin(schema.server, eq(schema.server.id, schema.keyDeployment.serverId))
      .where(and(eq(schema.keyDeployment.keyId, oldKeyId), eq(schema.keyDeployment.status, "deployed")));

    const results: { server: string; linuxUser: string; ok: boolean; error?: string }[] = [];
    for (const { d, server } of deployments) {
      const deployed = await deployKeyToServer({ server, key: newKey, linuxUser: d.linuxUser, actorId: session.user.id });
      if (!deployed.ok) {
        results.push({ server: server.name, linuxUser: d.linuxUser, ok: false, error: `Neuer Key nicht eingetragen: ${deployed.error}` });
        continue;
      }
      if (server.managementKeyId === oldKeyId && newKey.storageMode === "vault") {
        await db.update(schema.server).set({ managementKeyId: newKeyId }).where(eq(schema.server.id, server.id));
      }
      results.push({ server: server.name, linuxUser: d.linuxUser, ok: true });
    }
    // Alten Key nur dort entfernen, wo der neue sicher liegt
    const removable = results.filter((r) => r.ok).length;
    if (removable === deployments.length) {
      const removed = await revokeAllDeployments(oldKeyId, session.user.id);
      for (const r of removed.filter((x) => !x.ok)) {
        const entry = results.find((x) => x.server === r.server && x.linuxUser === r.linuxUser);
        if (entry) Object.assign(entry, { ok: false, error: `Alter Key nicht entfernt: ${r.error}` });
      }
      await db.update(schema.sshKey).set({ revokedAt: new Date() }).where(eq(schema.sshKey.id, oldKeyId));
      await db.delete(schema.sshKeySecret).where(eq(schema.sshKeySecret.keyId, oldKeyId));
    }
    await audit({
      action: "key.rotated",
      actorId: session.user.id,
      organizationId: oldKey.organizationId,
      targetType: "ssh_key",
      targetId: oldKeyId,
      ...(await requestMeta()),
      metadata: { newKeyId, servers: deployments.length, failed: results.filter((r) => !r.ok).length },
    });
    revalidatePath("/dashboard/keys");
    return { results, completed: removable === deployments.length };
  });
}
