import type { Metadata } from "next";
import { eq, inArray, schema } from "@ssh-academy/db";
import { MembershipEditor, NamedGroupForm } from "@/components/teams/forms";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { loadTeam } from "@/lib/team";
import { createServerGroup, deleteServerGroup, setServerGroupMembers } from "../actions";

export const metadata: Metadata = { title: "Server-Gruppen" };

export default async function ServerGroupsPage({ params }: PageProps<"/dashboard/teams/[id]/server-gruppen">) {
  const { id } = await params;
  const { can } = await loadTeam(id);
  const [groups, servers] = await Promise.all([
    db.select().from(schema.serverGroup).where(eq(schema.serverGroup.organizationId, id)).orderBy(schema.serverGroup.name),
    db
      .select({ id: schema.server.id, name: schema.server.name, host: schema.server.host })
      .from(schema.server)
      .where(eq(schema.server.organizationId, id))
      .orderBy(schema.server.name),
  ]);
  const links = groups.length
    ? await db.select().from(schema.serverGroupMember).where(inArray(schema.serverGroupMember.groupId, groups.map((g) => g.id)))
    : [];
  const nameOf = new Map(servers.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Server-Gruppen wie „Produktion“ oder „Test“ machen Freigaben übersichtlich: Ein neuer Server in der Gruppe ist sofort für alle freigegeben,
        die Zugriff auf die Gruppe haben.
      </p>
      {groups.length === 0 && (
        <Card>
          <p className="text-sm text-muted">Noch keine Server-Gruppen.</p>
        </Card>
      )}
      {groups.map((g) => {
        const selected = links.filter((l) => l.groupId === g.id).map((l) => l.serverId);
        return (
          <Card key={g.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{g.name}</h2>
                {g.description && <p className="text-sm text-muted">{g.description}</p>}
              </div>
              {can.manageAccess && (
                <ActionButton variant="ghost" confirm={`Server-Gruppe „${g.name}“ löschen? Ihre Freigaben werden mitgelöscht.`} action={deleteServerGroup.bind(null, id, g.id)}>
                  Löschen
                </ActionButton>
              )}
            </div>
            {can.manageAccess ? (
              <MembershipEditor
                options={servers.map((s) => ({ id: s.id, label: s.name, hint: s.host }))}
                selected={selected}
                action={setServerGroupMembers.bind(null, id, g.id)}
                empty="Das Team hat noch keine Server. Lege beim Hinzufügen eines Servers dieses Team als Besitzer fest."
              />
            ) : (
              <p className="text-sm">{selected.map((s) => nameOf.get(s)).join(", ") || "Keine Server"}</p>
            )}
          </Card>
        );
      })}
      {can.manageAccess && <NamedGroupForm action={createServerGroup.bind(null, id)} title="Neue Server-Gruppe" placeholder="z. B. Produktion" />}
    </div>
  );
}
