import { apiJson, authenticateApi } from "@/lib/api-tokens";
import { loadAudit, personalAudit } from "@/lib/audit-query";

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "audit:read");
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const rows = await loadAudit(personalAudit(auth.user.id), limit, offset);
  return apiJson(200, { events: rows.map((r) => ({ id: r.id, action: r.action, createdAt: r.createdAt, ip: r.ip, targetType: r.targetType, metadata: r.metadata })) });
}
