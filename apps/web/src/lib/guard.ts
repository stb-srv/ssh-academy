import "server-only";
import { getSecurityOverview } from "./security";
import { getSession } from "./session";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export class ActionError extends Error {}

export async function requireActionSession() {
  const session = await getSession();
  if (!session) throw new ActionError("Bitte melde dich erneut an.");
  return session;
}

/** Server und Tresor nur mit starker Anmeldung (Passkey, TOTP oder Pocket ID), siehe Projektkonzept 2.2 */
export async function requireStrongSession() {
  const session = await requireActionSession();
  const security = await getSecurityOverview(session.user.id);
  if (!security.strongAuth) {
    throw new ActionError("Für diese Aktion brauchst du einen Passkey oder die Zwei-Faktor-Anmeldung (Dashboard > Sicherheit).");
  }
  return session;
}

/** Führt eine Server-Action aus und wandelt erwartete Fehler in eine Meldung um */
export async function runAction<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, error: err.message };
    if (err instanceof Error && err.name === "GatewayUnavailableError") return { ok: false, error: err.message };
    if (err instanceof Error && "digest" in err) throw err; // redirect() und notFound() durchreichen
    console.error("[action]", err);
    return { ok: false, error: "Unerwarteter Fehler. Bitte versuche es erneut." };
  }
}
