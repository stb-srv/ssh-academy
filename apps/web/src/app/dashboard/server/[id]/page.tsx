import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, schema } from "@ssh-academy/db";
import { DeployKeyPanel } from "@/components/server/deploy-key-form";
import { HostKeyPanel } from "@/components/server/host-key-panel";
import { ManagementKeySelect } from "@/components/server/management-key-select";
import { ServerSettingsForm } from "@/components/server/server-settings-form";
import { ServerStatusBadge } from "@/components/server/status-badge";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { connectableKeys, getServerAccess, keyIsUsable, listAccessibleKeys } from "@/lib/access";
import { db } from "@/lib/db";
import { formatDateTime, KEY_MODE_LABELS } from "@/lib/format";
import { authOptions } from "@/lib/op-auth";
import { TEAM_ROLE_LABELS } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { removeDeploymentAction } from "../actions";

export const metadata: Metadata = { title: "Server" };

const DEPLOY_STATUS = {
  pending: ["wartet", "neutral"],
  deployed: ["eingetragen", "good"],
  removing: ["wird entfernt", "warn"],
  removed: ["entfernt", "neutral"],
  failed: ["Fehler", "bad"],
} as const;

export default async function ServerPage({ params }: PageProps<"/dashboard/server/[id]">) {
  const { id } = await params;
  const session = await requireSession();
  const access = await getServerAccess(session.user.id, id);
  if (!access) notFound();
  const { server } = access;

  const [deployments, myKeys, options, mgmtCandidates] = await Promise.all([
    db
      .select({ d: schema.keyDeployment, key: schema.sshKey })
      .from(schema.keyDeployment)
      .innerJoin(schema.sshKey, eq(schema.sshKey.id, schema.keyDeployment.keyId))
      .where(eq(schema.keyDeployment.serverId, id))
      .orderBy(desc(schema.keyDeployment.updatedAt)),
    listAccessibleKeys(session.user.id),
    access.canConnect ? authOptions(session.user.id, access) : Promise.resolve([]),
    access.canManage ? connectableKeys(session.user.id, id, server.defaultUser) : Promise.resolve([]),
  ]);
  const deployable = myKeys
    .filter(({ key, canManage }) => keyIsUsable(key) && (access.canManage ? canManage : key.ownerUserId === session.user.id))
    .map(({ key }) => ({ id: key.id, name: key.name, mode: KEY_MODE_LABELS[key.storageMode] }));
  const confirmed = Boolean(server.hostKeyConfirmedAt);
  const visibleDeployments = deployments.filter(({ d, key }) => access.canManage || key.ownerUserId === session.user.id || d.status === "deployed");

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted">
        <Link href="/dashboard/server" className="hover:underline">
          Server
        </Link>{" "}
        / {server.name}
      </nav>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{server.name}</h1>
          <ServerStatusBadge status={server.status} confirmed={confirmed} />
          {access.role !== "personal" && <Badge>{TEAM_ROLE_LABELS[access.role]}</Badge>}
        </div>
        <p className="font-mono text-sm text-muted">
          {server.host}:{server.port} · {server.osVersion ?? "System unbekannt"} · Standard-Benutzer {server.defaultUser}
        </p>
        {confirmed && access.canConnect && (
          <div className="flex flex-wrap gap-2 pt-1">
            <ButtonLink href={`/dashboard/server/${id}/terminal`}>Terminal öffnen</ButtonLink>
            <ButtonLink href={`/dashboard/server/${id}/dateien`} variant="secondary">
              Dateien (SFTP)
            </ButtonLink>
            {access.canManage && (server.os !== "other" || !server.osVersion) && (
              <ButtonLink href={`/dashboard/server/${id}/assistent`} variant="secondary">
                Benutzer-Assistent
              </ButtonLink>
            )}
          </div>
        )}
      </header>

      <HostKeyPanel
        serverId={id}
        fingerprint={server.hostKeyFingerprint}
        keyType={server.hostKeyType}
        confirmed={confirmed}
        canManage={access.canManage}
        mismatch={server.status === "host_key_mismatch"}
        lastError={server.lastError}
      />

      <Card className="space-y-4">
        <h2 className="font-semibold">Keys auf diesem Server</h2>
        {visibleDeployments.length === 0 ? (
          <p className="text-sm text-muted">Über die Plattform wurde hier noch kein Key eingetragen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Key</th>
                  <th className="py-2 pr-3 font-medium">Benutzer</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {visibleDeployments.map(({ d, key }) => {
                  const [label, tone] = DEPLOY_STATUS[d.status];
                  return (
                    <tr key={d.id} className="border-t border-border align-top">
                      <td className="py-2 pr-3">
                        <Link href={`/dashboard/keys/${key.id}`} className="hover:underline">
                          {key.name}
                        </Link>
                        {server.managementKeyId === key.id && d.linuxUser === server.defaultUser && <span className="ml-1 text-xs text-muted">(Verwaltung)</span>}
                      </td>
                      <td className="py-2 pr-3 font-mono">{d.linuxUser}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={tone}>{label}</Badge>
                        {d.lastError && <p className="mt-1 max-w-sm text-xs text-danger">{d.lastError}</p>}
                        <p className="text-xs text-muted">{formatDateTime(d.deployedAt ?? d.updatedAt)}</p>
                      </td>
                      <td className="py-2 text-right">
                        {d.status !== "removed" && (access.canManage || key.ownerUserId === session.user.id) && (
                          <ActionButton
                            variant="ghost"
                            confirm={`Key „${key.name}“ bei ${d.linuxUser} vom Server entfernen?`}
                            action={removeDeploymentAction.bind(null, d.id, undefined)}
                            successMessage="Entfernt."
                          >
                            Entfernen
                          </ActionButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {confirmed && access.canConnect && (
          <DeployKeyPanel
            initiallyOpen={visibleDeployments.length === 0}
            serverId={id}
            keys={deployable}
            authOptions={options}
            defaultUser={server.defaultUser}
            allowedUsers={access.linuxUsers}
          />
        )}
      </Card>

      {access.canManage && (
        <Card className="space-y-4">
          <h2 className="font-semibold">Einstellungen</h2>
          <ManagementKeySelect
            serverId={id}
            current={server.managementKeyId}
            defaultUser={server.defaultUser}
            options={mgmtCandidates.map((k) => ({ id: k.key.id, name: k.key.name }))}
          />
          <ServerSettingsForm server={server} />
        </Card>
      )}
      {server.organizationId && <RecentSessions serverId={id} />}
    </div>
  );
}

async function RecentSessions({ serverId }: { serverId: string }) {
  const sessions = await db
    .select({ s: schema.connectionSession, name: schema.user.name })
    .from(schema.connectionSession)
    .leftJoin(schema.user, eq(schema.user.id, schema.connectionSession.userId))
    .where(and(eq(schema.connectionSession.serverId, serverId)))
    .orderBy(desc(schema.connectionSession.createdAt))
    .limit(5);
  if (!sessions.length) return null;
  return (
    <Card>
      <h2 className="font-semibold">Letzte Verbindungen</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {sessions.map(({ s, name }) => (
          <li key={s.id} className="text-muted">
            {formatDateTime(s.startedAt ?? s.createdAt)}: {name ?? "?"} als <span className="font-mono">{s.linuxUser}</span> ({s.kind}, {s.status})
          </li>
        ))}
      </ul>
    </Card>
  );
}
