import { eq, schema, sql } from "@ssh-academy/db";
import { generateCaKey, importCaPrivateKey, signUserCertificate } from "@ssh-academy/ssh/cert";
import { parsePublicKey } from "@ssh-academy/ssh/keys";
import type { CreateCaRequest, CreateCaResult, SignCertRequest, SignCertResult } from "@ssh-academy/ssh/protocol";
import { db } from "./db";
import { openSecret, sealSecret } from "./vault";

export async function createCa(req: CreateCaRequest): Promise<CreateCaResult> {
  if (Boolean(req.ownerUserId) === Boolean(req.organizationId)) return { ok: false, error: "BAD_REQUEST", message: "Genau ein Besitzer nötig." };
  const ca = await generateCaKey(`ssh-academy-ca ${req.name}`);
  const sealed = await sealSecret(ca.privateKeyPkcs8);
  const [row] = await db
    .insert(schema.sshCa)
    .values({
      name: req.name,
      ownerUserId: req.ownerUserId ?? null,
      organizationId: req.organizationId ?? null,
      publicKey: ca.publicKey,
      fingerprintSha256: ca.fingerprint,
      ...sealed,
      createdBy: req.createdBy,
    })
    .returning({ id: schema.sshCa.id });
  return { ok: true, caId: row!.id, publicKey: ca.publicKey, fingerprint: ca.fingerprint };
}

export async function signCertificate(req: SignCertRequest): Promise<SignCertResult> {
  try {
    await parsePublicKey(req.publicKey);
  } catch (e) {
    return { ok: false, error: "BAD_REQUEST", message: (e as Error).message };
  }
  // Seriennummer atomar vergeben
  const [ca] = await db
    .update(schema.sshCa)
    .set({ nextSerial: sql`${schema.sshCa.nextSerial} + 1` })
    .where(eq(schema.sshCa.id, req.caId))
    .returning();
  if (!ca) return { ok: false, error: "BAD_REQUEST", message: "Zertifizierungsstelle nicht gefunden." };
  const serial = ca.nextSerial - 1n;
  const privateKey = await importCaPrivateKey(await openSecret(ca));
  // 1 Minute Toleranz für ungenaue Server-Uhren
  const validAfter = new Date(Date.now() - 60_000);
  const validBefore = new Date(Date.now() + req.validSeconds * 1000);
  const certificate = await signUserCertificate({
    caPrivateKey: privateKey,
    caPublicKey: ca.publicKey,
    userPublicKey: req.publicKey,
    keyId: req.keyId,
    principals: req.principals,
    validAfter,
    validBefore,
    serial,
    extensions: req.extensions,
  });
  return { ok: true, certificate, serial: serial.toString(), validAfter: validAfter.toISOString(), validBefore: validBefore.toISOString() };
}
