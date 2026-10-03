import type { Metadata } from "next";
import { and, eq, schema } from "@ssh-academy/db";
import { InstantSelect, InviteForm } from "@/components/teams/forms";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { TEAM_ROLE_LABELS, TEAM_ROLES, type TeamRole } from "@/lib/permissions";
import { loadTeam } from "@/lib/team";
import { cancelInvitation, changeRole, inviteMember, removeMember } from "./actions";

export const metadata: Metadata = { title: "Team-Mitglieder" };

const RANK: Record<TeamRole, number> = { viewer: 0, member: 1, operator: 2, admin: 3, owner: 4 };

export default async function TeamMembersPage({ params }: PageProps<"/dashboard/teams/[id]">) {
  const { id } = await params;
  const { session, role, can } = await loadTeam(id);
  const [members, invitations] = await Promise.all([
    db
      .select({ id: schema.member.id, role: schema.member.role, createdAt: schema.member.createdAt, userId: schema.user.id, name: schema.user.name, email: schema.user.email })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(eq(schema.member.organizationId, id))
      .orderBy(schema.user.name),
    can.invite
      ? db
          .select()
          .from(schema.invitation)
          .where(and(eq(schema.invitation.organizationId, id), eq(schema.invitation.status, "pending")))
          .orderBy(schema.invitation.createdAt)
      : Promise.resolve([]),
  ]);
  const roleOptions = TEAM_ROLES.filter((r) => RANK[r] <= RANK[role] && (r !== "owner" || role === "owner")).map((r) => ({ value: r, label: TEAM_ROLE_LABELS[r] }));

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 font-semibold">Mitglieder ({members.length})</h2>
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const self = m.userId === session.user.id;
            const r = m.role as TeamRole;
            const editable = can.manageMembers && !self && RANK[r] <= RANK[role] && (r !== "owner" || role === "owner");
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {m.name} {self && <Badge>du</Badge>}
                  </p>
                  <p className="truncate text-muted">
                    {m.email} · seit {formatDate(m.createdAt)}
                  </p>
                </div>
                {editable ? (
                  <InstantSelect label={`Rolle von ${m.name}`} value={r} options={roleOptions} action={changeRole.bind(null, id, m.id)} />
                ) : (
                  <Badge tone={r === "owner" ? "good" : "neutral"}>{TEAM_ROLE_LABELS[r] ?? r}</Badge>
                )}
                {(self || editable) && (
                  <ActionButton
                    variant={self ? "secondary" : "danger"}
                    confirm={
                      self
                        ? "Team wirklich verlassen? Deine persönlichen Keys werden dabei von allen Team-Servern entfernt."
                        : `${m.name} aus dem Team entfernen? Die persönlichen Keys der Person werden von allen Team-Servern entfernt.`
                    }
                    action={removeMember.bind(null, id, m.id)}
                  >
                    {self ? "Verlassen" : "Entfernen"}
                  </ActionButton>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {can.invite && (
        <>
          {invitations.length > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">Offene Einladungen</h2>
              <ul className="divide-y divide-border">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                    <Badge>{TEAM_ROLE_LABELS[inv.role as TeamRole] ?? inv.role}</Badge>
                    <span className={`text-xs ${inv.expiresAt < new Date() ? "text-danger" : "text-muted"}`}>
                      {inv.expiresAt < new Date() ? "abgelaufen" : `gültig bis ${formatDateTime(inv.expiresAt)}`}
                    </span>
                    <ActionButton variant="ghost" action={cancelInvitation.bind(null, id, inv.id)}>
                      Zurückziehen
                    </ActionButton>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <InviteForm action={inviteMember.bind(null, id)} roles={roleOptions} />
        </>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Was dürfen die Rollen?</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[120px_1fr]">
          <dt className="font-medium">Besitzer</dt>
          <dd className="text-muted">Alles, auch das Team löschen und Besitzer ernennen.</dd>
          <dt className="font-medium">Admin</dt>
          <dd className="text-muted">Mitglieder, Gruppen, Freigaben, Einstellungen, Protokoll und Aufzeichnungen.</dd>
          <dt className="font-medium">Operator</dt>
          <dd className="text-muted">Server und Team-Keys verwalten, auf allen Team-Servern verbinden.</dd>
          <dt className="font-medium">Mitglied</dt>
          <dd className="text-muted">Nur auf freigegebene Server verbinden, als die freigegebenen Linux-Benutzer.</dd>
          <dt className="font-medium">Betrachter</dt>
          <dd className="text-muted">Server und Keys ansehen, nicht verbinden.</dd>
        </dl>
      </Card>
    </div>
  );
}
