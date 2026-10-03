import { listAccessibleServers } from "@/lib/access";
import { apiJson, authenticateApi } from "@/lib/api-tokens";

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "servers:read");
  if ("error" in auth) return auth.error;
  const servers = await listAccessibleServers(auth.user.id);
  return apiJson(200, {
    servers: servers.map(({ server, teamName, canConnect, canManage, linuxUsers }) => ({
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port,
      status: server.status,
      os: server.osVersion,
      hostKeyFingerprint: server.hostKeyConfirmedAt ? server.hostKeyFingerprint : null,
      tags: server.tags,
      team: teamName ?? null,
      canConnect,
      canManage,
      linuxUsers,
    })),
  });
}
