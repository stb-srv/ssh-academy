import "server-only";
import { eq, schema } from "@ssh-academy/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import { env, POCKET_ID_PROVIDER } from "./env";
import { PLATFORM_ADMIN_ROLE } from "./permissions";

export async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  // Pocket-ID-Sitzungen haben eine feste Höchstdauer ab dem Login. Better Auth würde sie sonst
  // bei Aktivität verlängern; danach ist ein neuer Login über Pocket ID nötig (inkl. Gruppenabgleich).
  if (session.session.loginMethod === POCKET_ID_PROVIDER) {
    const maxAgeMs = env.POCKET_ID_MAX_SESSION_HOURS * 3600_000;
    if (Date.now() - new Date(session.session.createdAt).getTime() > maxAgeMs) {
      await db.delete(schema.session).where(eq(schema.session.id, session.session.id));
      return null;
    }
  }
  return session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/anmelden");
  return session;
}

export async function requirePlatformAdmin() {
  const session = await requireSession();
  if (session.user.role !== PLATFORM_ADMIN_ROLE) redirect("/dashboard");
  return session;
}
