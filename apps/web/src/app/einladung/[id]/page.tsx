import type { Metadata } from "next";
import { eq, schema } from "@ssh-academy/db";
import { InvitationAnswer } from "@/components/teams/invitation-answer";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { TEAM_ROLE_LABELS, type TeamRole } from "@/lib/permissions";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Team-Einladung" };

export default async function InvitationPage({ params }: PageProps<"/einladung/[id]">) {
  const { id } = await params;
  const session = await getSession();
  const here = `/einladung/${encodeURIComponent(id)}`;

  if (!session) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-12">
        <h1 className="text-2xl font-bold">Team-Einladung</h1>
        <p className="text-sm text-muted">
          Melde dich mit der E-Mail-Adresse an, an die die Einladung ging. Wenn du noch kein Konto hast, registriere dich zuerst oder nutze Pocket ID.
        </p>
        <div className="flex gap-3">
          <ButtonLink href={`/anmelden?weiter=${encodeURIComponent(here)}`}>Anmelden</ButtonLink>
          <ButtonLink href="/registrieren" variant="secondary">
            Registrieren
          </ButtonLink>
        </div>
      </div>
    );
  }

  const [row] = await db
    .select({ inv: schema.invitation, teamName: schema.organization.name, inviter: schema.user.name })
    .from(schema.invitation)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.invitation.organizationId))
    .innerJoin(schema.user, eq(schema.user.id, schema.invitation.inviterId))
    .where(eq(schema.invitation.id, id));
  const mine = row && row.inv.email.toLowerCase() === session.user.email.toLowerCase();

  let problem: string | null = null;
  if (!mine) problem = `Diese Einladung gibt es nicht oder sie gilt für eine andere E-Mail-Adresse als ${session.user.email}.`;
  else if (row.inv.status === "accepted") problem = "Du hast diese Einladung schon angenommen.";
  else if (row.inv.status !== "pending") problem = "Diese Einladung wurde abgelehnt oder zurückgezogen.";
  else if (row.inv.expiresAt < new Date()) problem = "Die Einladung ist abgelaufen. Bitte lass dich erneut einladen.";

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">Team-Einladung</h1>
      {problem || !row ? (
        <>
          <Alert tone="warning">{problem}</Alert>
          <ButtonLink href="/dashboard/teams" variant="secondary">
            Zu deinen Teams
          </ButtonLink>
        </>
      ) : (
        <Card className="space-y-4">
          <p>
            <span className="font-medium">{row.inviter}</span> lädt dich in das Team <span className="font-medium">{row.teamName}</span> ein, als{" "}
            <span className="font-medium">{TEAM_ROLE_LABELS[row.inv.role as TeamRole] ?? row.inv.role}</span>.
          </p>
          <p className="text-xs text-muted">Gültig bis {formatDateTime(row.inv.expiresAt)}</p>
          <InvitationAnswer invitationId={id} />
        </Card>
      )}
    </div>
  );
}
