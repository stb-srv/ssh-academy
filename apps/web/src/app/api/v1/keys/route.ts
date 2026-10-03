import { listAccessibleKeys } from "@/lib/access";
import { apiJson, authenticateApi } from "@/lib/api-tokens";

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "keys:read");
  if ("error" in auth) return auth.error;
  const keys = await listAccessibleKeys(auth.user.id);
  return apiJson(200, {
    keys: keys.map(({ key, teamName }) => ({
      id: key.id,
      name: key.name,
      type: key.type,
      bits: key.bits,
      fingerprint: key.fingerprintSha256,
      publicKey: key.publicKey,
      storage: key.storageMode,
      team: teamName ?? null,
      expiresAt: key.expiresAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
    })),
  });
}
