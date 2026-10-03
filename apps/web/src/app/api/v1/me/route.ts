import { getMemberships } from "@/lib/access";
import { apiJson, authenticateApi } from "@/lib/api-tokens";

export async function GET(req: Request) {
  // Jedes gültige Token darf das eigene Konto lesen
  const auth = await authenticateApi(req, null);
  if ("error" in auth) return auth.error;
  const teams = await getMemberships(auth.user.id);
  return apiJson(200, {
    id: auth.user.id,
    name: auth.user.name,
    email: auth.user.email,
    teams: teams.map((t) => ({ id: t.organizationId, name: t.name, role: t.role })),
    token: { name: auth.token.name, scopes: auth.token.scopes, expiresAt: auth.token.expiresAt },
  });
}
