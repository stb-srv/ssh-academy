"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, schema } from "@ssh-academy/db";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionError, requireActionSession, runAction } from "@/lib/guard";
import { requestMeta } from "@/lib/request";

async function loadOwnInvitation(invitationId: string) {
  const session = await requireActionSession();
  const [inv] = await db.select().from(schema.invitation).where(eq(schema.invitation.id, invitationId));
  if (!inv || inv.email.toLowerCase() !== session.user.email.toLowerCase()) throw new ActionError("Diese Einladung gibt es nicht oder sie gilt für eine andere E-Mail-Adresse.");
  if (inv.status !== "pending") throw new ActionError("Diese Einladung wurde schon beantwortet oder zurückgezogen.");
  if (inv.expiresAt < new Date()) throw new ActionError("Die Einladung ist abgelaufen. Bitte lass dich erneut einladen.");
  return { session, inv };
}

export async function acceptInvitation(invitationId: string) {
  return runAction(async () => {
    const { session, inv } = await loadOwnInvitation(invitationId);
    await auth.api.acceptInvitation({ body: { invitationId }, headers: await headers() });
    await audit({ action: "invitation.accepted", actorId: session.user.id, organizationId: inv.organizationId, ...(await requestMeta()), metadata: { role: inv.role } });
    revalidatePath("/dashboard/teams");
    return { organizationId: inv.organizationId };
  });
}

export async function rejectInvitation(invitationId: string) {
  return runAction(async () => {
    const { session, inv } = await loadOwnInvitation(invitationId);
    await auth.api.rejectInvitation({ body: { invitationId }, headers: await headers() });
    await audit({ action: "invitation.rejected", actorId: session.user.id, organizationId: inv.organizationId, ...(await requestMeta()) });
    return {};
  });
}
