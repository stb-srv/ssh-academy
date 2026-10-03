import "server-only";
import { desc, eq, inArray, or, schema } from "@ssh-academy/db";
import { parsePublicKey } from "@ssh-academy/ssh/keys";
import { isValidLinuxUser } from "@ssh-academy/ssh/ops";
import { activeGrants, getKeyAccess, getMemberships, getTeamSettings, roleAllows } from "./access";
import { db } from "./db";
import { signCertificate } from "./gateway";
import { ActionError } from "./guard";

export type CaAccess = {
  ca: typeof schema.sshCa.$inferSelect;
  teamName?: string;
  canManage: boolean;
  /** Erlaubte Principals beim Signieren ("any" = beliebig) */
  principals: string[] | "any";
  maxMinutes: number;
};

/** Persönliche Zertifizierungsstellen dürfen bis zu 30 Tage gültige Zertifikate ausstellen */
const PERSONAL_MAX_MINUTES = 60 * 24 * 30;

export async function listCaAccess(userId: string): Promise<CaAccess[]> {
  const memberships = await getMemberships(userId);
  const orgIds = memberships.map((m) => m.organizationId);
  const cas = await db
    .select()
    .from(schema.sshCa)
    .where(or(eq(schema.sshCa.ownerUserId, userId), orgIds.length ? inArray(schema.sshCa.organizationId, orgIds) : undefined))
    .orderBy(schema.sshCa.createdAt);
  const result: CaAccess[] = [];
  for (const ca of cas) {
    if (ca.ownerUserId) {
      result.push({ ca, canManage: true, principals: "any", maxMinutes: PERSONAL_MAX_MINUTES });
      continue;
    }
    const m = memberships.find((x) => x.organizationId === ca.organizationId)!;
    const settings = await getTeamSettings(ca.organizationId!);
    const canManage = roleAllows(m.role, { server: ["update"] });
    let principals: string[] | "any" = "any";
    if (!canManage) {
      if (!roleAllows(m.role, { server: ["connect"] })) continue;
      // Mitglieder bekommen Zertifikate nur für Linux-Benutzer, die ihnen im Team freigegeben sind
      const grants = await activeGrants(userId, ca.organizationId!);
      principals = [...new Set([...grants.values()].flatMap((s) => [...s]))].sort();
      if (!principals.length) continue;
    }
    result.push({ ca, teamName: m.name, canManage, principals, maxMinutes: settings.maxCertMinutes });
  }
  return result;
}

export async function recentCertificates(caIds: string[], userId: string, managedCaIds: string[]) {
  if (!caIds.length) return [];
  const rows = await db
    .select({ cert: schema.sshCertificate, userName: schema.user.name, caName: schema.sshCa.name })
    .from(schema.sshCertificate)
    .innerJoin(schema.sshCa, eq(schema.sshCa.id, schema.sshCertificate.caId))
    .leftJoin(schema.user, eq(schema.user.id, schema.sshCertificate.userId))
    .where(inArray(schema.sshCertificate.caId, caIds))
    .orderBy(desc(schema.sshCertificate.createdAt))
    .limit(100);
  // Verwalter sehen alle Zertifikate ihrer Stellen, alle anderen nur ihre eigenen
  return rows.filter((r) => managedCaIds.includes(r.cert.caId) || r.cert.userId === userId);
}

export type IssueInput = { caId: string; keyId?: string; publicKey?: string; principals: string[]; minutes: number };

/**
 * Stellt ein Zertifikat aus (Dashboard und API). Prüft Zugriff auf die Stelle, erlaubte Principals
 * und die Höchstdauer aus den Team-Einstellungen. Fehler kommen als ActionError mit lesbarem Text.
 */
export async function issueCertificate(user: { id: string; email: string }, input: IssueInput) {
  const access = (await listCaAccess(user.id)).find((a) => a.ca.id === input.caId);
  if (!access) throw new ActionError("Zertifizierungsstelle nicht gefunden.");

  let publicKey = (input.publicKey ?? "").trim();
  let storedKeyId: string | null = null;
  if (input.keyId) {
    const key = await getKeyAccess(user.id, input.keyId);
    if (!key || key.key.ownerUserId !== user.id) throw new ActionError("Zertifikate gibt es nur für deine eigenen Keys.");
    if (key.key.revokedAt) throw new ActionError("Dieser Key ist gesperrt.");
    publicKey = key.key.publicKey;
    storedKeyId = key.key.id;
  }
  if (!publicKey) throw new ActionError("Bitte einen Key wählen oder einen Public Key angeben.");
  let parsed;
  try {
    parsed = await parsePublicKey(publicKey);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }

  const principals = [...new Set(input.principals.map((p) => p.trim()).filter(Boolean))];
  if (!principals.length) throw new ActionError("Bitte mindestens einen Linux-Benutzer angeben.");
  if (principals.length > 10) throw new ActionError("Höchstens 10 Linux-Benutzer pro Zertifikat.");
  for (const p of principals) if (!isValidLinuxUser(p)) throw new ActionError(`„${p}“ ist kein gültiger Linux-Benutzer.`);
  if (access.principals !== "any") {
    const allowed = access.principals;
    const denied = principals.filter((p) => !allowed.includes(p));
    if (denied.length) throw new ActionError(`Dafür hast du keine Freigabe: ${denied.join(", ")}`);
  }
  const minutes = Math.floor(input.minutes);
  if (!Number.isFinite(minutes) || minutes < 5) throw new ActionError("Mindestens 5 Minuten.");
  if (minutes > access.maxMinutes) throw new ActionError(`Höchstens ${access.maxMinutes} Minuten (Team-Einstellung).`);

  const certKeyId = `${user.email} via SSH-Academy`;
  const result = await signCertificate({ caId: input.caId, publicKey: parsed.line, keyId: certKeyId, principals, validSeconds: minutes * 60 });
  if (!result.ok) throw new ActionError(result.message);
  await db.insert(schema.sshCertificate).values({
    caId: input.caId,
    keyId: storedKeyId,
    userId: user.id,
    serial: BigInt(result.serial),
    certKeyId,
    principals,
    publicKeyFingerprint: parsed.fingerprint,
    validAfter: new Date(result.validAfter),
    validBefore: new Date(result.validBefore),
  });
  return {
    caId: input.caId,
    organizationId: access.ca.organizationId,
    certificate: result.certificate,
    serial: result.serial,
    validAfter: result.validAfter,
    validBefore: result.validBefore,
    principals,
    minutes,
    fingerprint: parsed.fingerprint,
    keyType: parsed.type,
  };
}
