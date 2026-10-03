"use server";
import { revalidatePath } from "next/cache";
import { eq, schema } from "@ssh-academy/db";
import { installUserCa } from "@ssh-academy/ssh/ops";
import { z } from "zod";
import { getServerAccess, resolveOwner } from "@/lib/access";
import { audit } from "@/lib/audit";
import { issueCertificate } from "@/lib/certificates";
import { db } from "@/lib/db";
import { createCa } from "@/lib/gateway";
import { ActionError, requireStrongSession, runAction } from "@/lib/guard";
import { parseOpAuth } from "@/lib/op-auth";
import { requestMeta } from "@/lib/request";
import { resolveCredentials, resultMessage, runOnServer } from "@/lib/server-ops";

export async function createCaAction(_prev: unknown, form: FormData) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const name = z.string().trim().min(2, "Bitte einen Namen angeben.").max(60).parse(form.get("name"));
    const owner = await resolveOwner(session.user.id, String(form.get("owner") ?? "personal"), { server: ["update"] });
    if (!owner) throw new ActionError("Du darfst für dieses Team keine Zertifizierungsstelle anlegen.");
    const result = await createCa({ name, ownerUserId: owner.ownerUserId ?? undefined, organizationId: owner.organizationId ?? undefined, createdBy: session.user.id });
    if (!result.ok) throw new ActionError(result.message);
    await audit({
      action: "ca.created",
      actorId: session.user.id,
      organizationId: owner.organizationId,
      targetType: "ssh_ca",
      targetId: result.caId,
      ...(await requestMeta()),
      metadata: { name, fingerprint: result.fingerprint },
    });
    revalidatePath("/dashboard/zertifikate");
    return {};
  });
}

export async function signCertificateAction(_prev: unknown, form: FormData) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const result = await issueCertificate(session.user, {
      caId: String(form.get("caId") ?? ""),
      keyId: String(form.get("keyId") ?? "") || undefined,
      publicKey: String(form.get("publicKey") ?? ""),
      principals: String(form.get("principals") ?? "").split(/[\s,]+/),
      minutes: Number(form.get("minutes")),
    });
    await audit({
      action: "certificate.issued",
      actorId: session.user.id,
      organizationId: result.organizationId,
      targetType: "ssh_ca",
      targetId: result.caId,
      ...(await requestMeta()),
      metadata: { serial: result.serial, principals: result.principals, minutes: result.minutes, fingerprint: result.fingerprint },
    });
    revalidatePath("/dashboard/zertifikate");
    return { certificate: result.certificate, validBefore: result.validBefore, serial: result.serial, keyType: result.keyType };
  });
}

/** Hinterlegt die Zertifizierungsstelle auf einem Server (TrustedUserCAKeys) */
export async function installCaAction(serverId: string, _prev: unknown, form: FormData) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const access = await getServerAccess(session.user.id, serverId);
    if (!access?.canManage) throw new ActionError("Nur Verwalter dieses Servers dürfen das.");
    const caId = String(form.get("caId") ?? "");
    const [ca] = await db.select().from(schema.sshCa).where(eq(schema.sshCa.id, caId));
    const sameOwner = ca && (access.server.ownerUserId ? ca.ownerUserId === access.server.ownerUserId : ca.organizationId === access.server.organizationId);
    if (!ca || !sameOwner) throw new ActionError("Diese Zertifizierungsstelle gehört nicht zum Besitzer des Servers.");
    const auth = parseOpAuth(form);
    const credentials = await resolveCredentials(session.user.id, access, auth);
    const result = await runOnServer(access.server, credentials, installUserCa({ caPublicKeys: [ca.publicKey] }), { sudoPassword: auth.sudoPassword });
    const error = resultMessage(result);
    if (error) throw new ActionError(error);
    await db.update(schema.server).set({ trustedCaId: ca.id }).where(eq(schema.server.id, serverId));
    await audit({
      action: "server.ca_installed",
      actorId: session.user.id,
      organizationId: access.server.organizationId,
      targetType: "server",
      targetId: serverId,
      ...(await requestMeta()),
      metadata: { name: ca.name, fingerprint: ca.fingerprintSha256 },
    });
    revalidatePath(`/dashboard/server/${serverId}`);
    return { message: "Der Server akzeptiert jetzt Zertifikate dieser Stelle." };
  });
}
