import type { Metadata } from "next";
import { eq, schema } from "@ssh-academy/db";
import { CreateTeamForm } from "@/components/dashboard/create-team-form";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { TEAM_ROLE_LABELS, type TeamRole } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage() {
  const session = await requireSession();
  const teams = await db
    .select({ id: schema.organization.id, name: schema.organization.name, role: schema.member.role })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, session.user.id));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Teams</h1>
      <p className="text-sm text-muted">
        In einem Team teilt ihr Server und Keys. Rollen, Nutzergruppen und Freigaben folgen in einer späteren
        Ausbaustufe.
      </p>
      <Card>
        {teams.length === 0 ? (
          <p className="text-sm text-muted">Du bist noch in keinem Team.</p>
        ) : (
          <ul className="divide-y divide-border">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="text-muted">{TEAM_ROLE_LABELS[t.role as TeamRole] ?? t.role}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CreateTeamForm />
    </div>
  );
}
