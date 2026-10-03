import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or, schema } from "@ssh-academy/db";
import { db } from "./db";

/** Rechte, die ein API-Token haben kann */
export const API_SCOPES = {
  "keys:read": "SSH-Keys lesen",
  "servers:read": "Server lesen",
  "audit:read": "Eigenes Protokoll lesen",
  "certificates:issue": "Zertifikate ausstellen",
} as const;
export type ApiScope = keyof typeof API_SCOPES;
export const isApiScope = (s: string): s is ApiScope => s in API_SCOPES;

export const TOKEN_PREFIX = "ssha_";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function generateToken() {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 6) };
}

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...(status === 401 ? { "www-authenticate": 'Bearer realm="ssh-academy"' } : {}) } });

export const apiError = (status: number, message: string) => json(status, { error: message });

/**
 * Prüft das Bearer-Token einer API-Anfrage. Gibt den Nutzer zurück oder eine fertige Fehlerantwort.
 * Gesperrte Nutzer (auch durch den Pocket-ID-Abgleich) werden abgewiesen.
 */
/** scope null: jedes gültige Token genügt */
export async function authenticateApi(req: Request, scope: ApiScope | null) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith(TOKEN_PREFIX)) return { error: apiError(401, "Bitte ein API-Token als Bearer-Token mitsenden.") };
  const now = new Date();
  const [row] = await db
    .select({ token: schema.apiToken, user: schema.user })
    .from(schema.apiToken)
    .innerJoin(schema.user, eq(schema.user.id, schema.apiToken.userId))
    .where(
      and(
        eq(schema.apiToken.tokenHash, hashToken(token)),
        isNull(schema.apiToken.revokedAt),
        or(isNull(schema.apiToken.expiresAt), gt(schema.apiToken.expiresAt, now)),
      ),
    );
  if (!row || row.user.banned) return { error: apiError(401, "Token ungültig, abgelaufen oder widerrufen.") };
  if (scope && !row.token.scopes.includes(scope)) return { error: apiError(403, `Dem Token fehlt das Recht „${scope}“.`) };
  // Zuletzt-genutzt höchstens einmal pro Minute schreiben
  if (!row.token.lastUsedAt || now.getTime() - row.token.lastUsedAt.getTime() > 60_000) {
    await db.update(schema.apiToken).set({ lastUsedAt: now }).where(eq(schema.apiToken.id, row.token.id));
  }
  return { user: row.user, token: row.token };
}

export { json as apiJson };
