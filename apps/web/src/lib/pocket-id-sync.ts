import "server-only";
import { and, eq, inArray, schema } from "@ssh-academy/db";
import { audit } from "./audit";
import { db } from "./db";
import { env, POCKET_ID_PROVIDER } from "./env";
import { offboardMember } from "./offboarding";
import { syncPocketIdGroups } from "./pocket-id";

/**
 * Regelmäßiger Abgleich mit der Pocket-ID-API (Projektkonzept 2.3): Wer in Pocket ID gesperrt oder
 * gelöscht wurde, wird hier gesperrt, abgemeldet und aus allen Teams offboardet, ohne dass er sich
 * erst neu anmelden muss. Gruppenänderungen werden ebenfalls übernommen.
 */

export const POCKET_ID_BAN_REASON = "In Pocket ID gesperrt oder gelöscht";

type PocketIdUser = { id: string; email?: string; disabled?: boolean; userGroups?: { name: string }[] };
type Page = { data: PocketIdUser[]; pagination?: { totalPages?: number } };

async function fetchAllUsers(): Promise<Map<string, PocketIdUser>> {
  const base = env.POCKET_ID_URL!.replace(/\/$/, "");
  const users = new Map<string, PocketIdUser>();
  for (let page = 1; page <= 1000; page++) {
    const url = `${base}/api/users?pagination[page]=${page}&pagination[limit]=100`;
    const res = await fetch(url, { headers: { "X-API-KEY": env.POCKET_ID_API_KEY! }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Pocket-ID-API antwortet mit ${res.status}`);
    const body = (await res.json()) as Page;
    if (!Array.isArray(body.data)) throw new Error("Unerwartete Antwort der Pocket-ID-API");
    for (const u of body.data) users.set(u.id, u);
    if (page >= (body.pagination?.totalPages ?? 1)) break;
  }
  return users;
}

export async function runPocketIdSync() {
  const remote = await fetchAllUsers();
  // Sicherheitsnetz: Eine leere Liste deutet eher auf einen Konfigurationsfehler als auf "alle gelöscht"
  if (remote.size === 0) throw new Error("Pocket ID meldet keine Nutzer, Abgleich übersprungen");

  const linked = await db
    .select({ userId: schema.account.userId, accountId: schema.account.accountId, banned: schema.user.banned, banReason: schema.user.banReason })
    .from(schema.account)
    .innerJoin(schema.user, eq(schema.user.id, schema.account.userId))
    .where(eq(schema.account.providerId, POCKET_ID_PROVIDER));

  let disabled = 0;
  let reenabled = 0;
  for (const acc of linked) {
    const u = remote.get(acc.accountId);
    const gone = !u || u.disabled === true;
    if (gone && !acc.banned) {
      await disableUser(acc.userId, u ? "disabled" : "deleted");
      disabled++;
    } else if (!gone && acc.banned && acc.banReason === POCKET_ID_BAN_REASON) {
      // Nur Sperren aufheben, die dieser Abgleich selbst gesetzt hat
      await db.update(schema.user).set({ banned: false, banReason: null }).where(eq(schema.user.id, acc.userId));
      reenabled++;
    }
    if (!gone && Array.isArray(u.userGroups)) {
      await syncPocketIdGroups(acc.userId, u.userGroups.map((g) => g.name));
    }
  }
  return { checked: linked.length, disabled, reenabled };
}

async function disableUser(userId: string, reason: "disabled" | "deleted") {
  await db.update(schema.user).set({ banned: true, banReason: POCKET_ID_BAN_REASON }).where(eq(schema.user.id, userId));
  await db.delete(schema.session).where(eq(schema.session.userId, userId));
  // Offene Verbindungs-Tokens verfallen lassen; laufende Verbindungen beendet das Gateway bei seiner nächsten Prüfung (alle 30 Sekunden)
  await db
    .update(schema.connectionSession)
    .set({ tokenHash: null, status: "closed", endReason: "Nutzer gesperrt" })
    .where(and(eq(schema.connectionSession.userId, userId), eq(schema.connectionSession.status, "pending")));
  await audit({ action: "pocket_id.user_disabled", actorId: null, targetType: "user", targetId: userId, metadata: { reason } });

  const memberships = await db.select({ organizationId: schema.member.organizationId }).from(schema.member).where(eq(schema.member.userId, userId));
  if (memberships.length) {
    await db.delete(schema.member).where(and(eq(schema.member.userId, userId), inArray(schema.member.organizationId, memberships.map((m) => m.organizationId))));
    for (const m of memberships) await offboardMember(m.organizationId, userId, null);
  }
}

let timer: NodeJS.Timeout | null = null;

/** Startet den periodischen Abgleich (aus instrumentation.ts), wenn ein API-Key gesetzt ist */
export function startPocketIdSync() {
  if (timer || !env.POCKET_ID_URL || !env.POCKET_ID_API_KEY) return;
  const run = () =>
    runPocketIdSync()
      .then((r) => {
        if (r.disabled || r.reenabled) console.info(`[pocket-id] Abgleich: ${r.disabled} gesperrt, ${r.reenabled} entsperrt`);
      })
      .catch((err) => console.error("[pocket-id] Abgleich fehlgeschlagen:", err instanceof Error ? err.message : err));
  timer = setInterval(run, env.POCKET_ID_SYNC_MINUTES * 60_000);
  timer.unref();
  setTimeout(run, 30_000).unref();
}
