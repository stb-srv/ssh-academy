import "server-only";
import { headers } from "next/headers";

/** IP-Adresse und Browser der aktuellen Anfrage (für das Audit-Log) */
export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}
