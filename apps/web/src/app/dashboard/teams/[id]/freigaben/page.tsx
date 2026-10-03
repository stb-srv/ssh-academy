import type { Metadata } from "next";
import { desc, eq, schema } from "@ssh-academy/db";
import { GrantForm } from "@/components/teams/grant-form";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { loadTeam } from "@/lib/team";
import { createGrant, deleteGrant } from "../actions";

export const metadata: Metadata = { title: "Freigaben" };

export default async function GrantsPage({ params }: PageProps<"/dashboard/teams/[id]/freigaben">) {
  const { id } = await params;
  const { can } = await loadTeam(id);
  const [grants, members, userGroups, servers, serverGroups] = await Promise.all([
    db.select().from(schema.accessGrant).where(eq(schema.accessGrant.organizationId, id)).orderBy(desc(schema.accessGrant.createdAt)),
    db
      .select({ id: schema.user.id, name: schema.user.name, role: schema.member.role })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(eq(schema.member.organizationId, id))
      .orderBy(schema.user.name),
    db.select().from(schema.userGroup).where(eq(schema.userGroup.organizationId, id)).orderBy(schema.userGroup.name),
    db.select({ id: schema.server.id, name: schema.server.name }).from(schema.server).where(eq(schema.server.organizationId, id)).orderBy(schema.server.name),
    db.select().from(schema.serverGroup).where(eq(schema.serverGroup.organizationId, id)).orderBy(schema.serverGroup.name),
  ]);
  const names = new Map<string, string>([
    ...members.map((m) => [`user:${m.id}`, m.name] as const),
    ...userGroups.map((g) => [`group:${g.id}`, `Gruppe ${g.name}`] as const),
    ...servers.map((s) => [`server:${s.id}`, s.name] as const),
    ...serverGroups.map((g) => [`sgroup:${g.id}`, `Server-Gruppe ${g.name}`] as const),
  ]);
  const now = new Date();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Mitglieder mit der Rolle „Mitglied“ sehen nur Server, für die es eine Freigabe gibt, und dürfen sich nur als der freigegebene Linux-Benutzer
        anmelden. Operatoren, Admins und Besitzer brauchen keine Freigabe.
      </p>
      <Card>
        {grants.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Freigaben.</p>
        ) : (
          <ul className="divide-y divide-border">
            {grants.map((g) => {
              const subject = g.subjectUserId ? names.get(`user:${g.subjectUserId}`) : names.get(`group:${g.subjectGroupId}`);
              const target = g.targetServerId ? names.get(`server:${g.targetServerId}`) : names.get(`sgroup:${g.targetGroupId}`);
              const expired = g.validUntil && g.validUntil <= now;
              const future = g.validFrom && g.validFrom > now;
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-medium">{subject ?? "?"}</span> darf auf <span className="font-medium">{target ?? "?"}</span> als{" "}
                      <code className="font-mono">{g.linuxUser}</code>
                      {g.linuxUser === "root" && (
                        <>
                          {" "}
                          <Badge tone="warn">root</Badge>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {g.validFrom ? `ab ${formatDateTime(g.validFrom)}` : "sofort"} · {g.validUntil ? `bis ${formatDateTime(g.validUntil)}` : "unbefristet"}
                    </p>
                  </div>
                  {expired ? <Badge tone="bad">abgelaufen</Badge> : future ? <Badge tone="warn">geplant</Badge> : <Badge tone="good">aktiv</Badge>}
                  {can.manageAccess && (
                    <ActionButton variant="ghost" confirm="Freigabe löschen? Laufende Verbindungen bleiben bis zum Ende bestehen." action={deleteGrant.bind(null, id, g.id)}>
                      Löschen
                    </ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {can.manageAccess &&
        (servers.length === 0 && serverGroups.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Lege zuerst einen Server mit diesem Team als Besitzer an, dann kannst du ihn freigeben.</p>
          </Card>
        ) : (
          <GrantForm
            action={createGrant.bind(null, id)}
            subjects={[
              { label: "Personen", options: members.map((m) => ({ value: `user:${m.id}`, label: m.name })) },
              { label: "Nutzergruppen", options: userGroups.map((g) => ({ value: `group:${g.id}`, label: g.name })) },
            ]}
            targets={[
              { label: "Server", options: servers.map((s) => ({ value: `server:${s.id}`, label: s.name })) },
              { label: "Server-Gruppen", options: serverGroups.map((g) => ({ value: `group:${g.id}`, label: g.name })) },
            ]}
          />
        ))}
    </div>
  );
}
