import type { Metadata } from "next";
import { eq, inArray, schema } from "@ssh-academy/db";
import { MembershipEditor, NamedGroupForm } from "@/components/teams/forms";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { loadTeam } from "@/lib/team";
import { createUserGroup, deleteUserGroup, setUserGroupMembers } from "../actions";

export const metadata: Metadata = { title: "Nutzergruppen" };

export default async function UserGroupsPage({ params }: PageProps<"/dashboard/teams/[id]/gruppen">) {
  const { id } = await params;
  const { can } = await loadTeam(id);
  const [groups, members] = await Promise.all([
    db.select().from(schema.userGroup).where(eq(schema.userGroup.organizationId, id)).orderBy(schema.userGroup.name),
    db
      .select({ userId: schema.user.id, name: schema.user.name, email: schema.user.email })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(eq(schema.member.organizationId, id))
      .orderBy(schema.user.name),
  ]);
  const links = groups.length
    ? await db.select().from(schema.userGroupMember).where(inArray(schema.userGroupMember.groupId, groups.map((g) => g.id)))
    : [];
  const nameOf = new Map(members.map((m) => [m.userId, m.name]));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Nutzergruppen fassen Personen zusammen, damit du Freigaben nicht für jede Person einzeln anlegen musst. Gruppen aus Pocket ID werden beim
        Login automatisch abgeglichen.
      </p>
      {groups.length === 0 && (
        <Card>
          <p className="text-sm text-muted">Noch keine Gruppen.</p>
        </Card>
      )}
      {groups.map((g) => {
        const selected = links.filter((l) => l.groupId === g.id).map((l) => l.userId);
        return (
          <Card key={g.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{g.name}</h2>
                {g.description && <p className="text-sm text-muted">{g.description}</p>}
              </div>
              {can.manageAccess && (
                <ActionButton variant="ghost" confirm={`Gruppe „${g.name}“ löschen? Ihre Freigaben werden mitgelöscht.`} action={deleteUserGroup.bind(null, id, g.id)}>
                  Löschen
                </ActionButton>
              )}
            </div>
            {can.manageAccess ? (
              <MembershipEditor
                options={members.map((m) => ({ id: m.userId, label: m.name, hint: m.email }))}
                selected={selected}
                action={setUserGroupMembers.bind(null, id, g.id)}
                empty="Das Team hat noch keine Mitglieder."
              />
            ) : (
              <p className="text-sm">{selected.map((u) => nameOf.get(u)).join(", ") || "Keine Mitglieder"}</p>
            )}
          </Card>
        );
      })}
      {can.manageAccess && <NamedGroupForm action={createUserGroup.bind(null, id)} title="Neue Nutzergruppe" placeholder="z. B. Entwicklung" />}
    </div>
  );
}
