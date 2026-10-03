import { z } from "zod";
import { apiError, apiJson, authenticateApi } from "@/lib/api-tokens";
import { audit } from "@/lib/audit";
import { issueCertificate, listCaAccess } from "@/lib/certificates";
import { gatewayEnabled } from "@/lib/env";
import { ActionError } from "@/lib/guard";
import { requestMeta } from "@/lib/request";

const body = z.object({
  caId: z.uuid(),
  keyId: z.uuid().optional(),
  publicKey: z.string().max(20_000).optional(),
  principals: z.array(z.string().max(32)).min(1).max(10),
  minutes: z.number().int().min(5),
});

/** Zertifizierungsstellen, bei denen das Token Zertifikate holen kann */
export async function GET(req: Request) {
  const auth = await authenticateApi(req, "certificates:issue");
  if ("error" in auth) return auth.error;
  const cas = await listCaAccess(auth.user.id);
  return apiJson(200, {
    authorities: cas.map((c) => ({ id: c.ca.id, name: c.ca.name, team: c.teamName ?? null, fingerprint: c.ca.fingerprintSha256, principals: c.principals, maxMinutes: c.maxMinutes })),
  });
}

export async function POST(req: Request) {
  const auth = await authenticateApi(req, "certificates:issue");
  if ("error" in auth) return auth.error;
  if (!gatewayEnabled) return apiError(503, "Das SSH-Gateway ist nicht eingerichtet.");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "Ungültige Anfrage.");
  try {
    const result = await issueCertificate(auth.user, parsed.data);
    await audit({
      action: "certificate.issued",
      actorId: auth.user.id,
      organizationId: result.organizationId,
      targetType: "ssh_ca",
      targetId: result.caId,
      ...(await requestMeta()),
      metadata: { serial: result.serial, principals: result.principals, minutes: result.minutes, fingerprint: result.fingerprint, via: "api", token: auth.token.name },
    });
    return apiJson(201, { certificate: result.certificate, serial: result.serial, validAfter: result.validAfter, validBefore: result.validBefore, principals: result.principals });
  } catch (e) {
    if (e instanceof ActionError) return apiError(400, e.message);
    if (e instanceof Error && e.name === "GatewayUnavailableError") return apiError(503, e.message);
    throw e;
  }
}
