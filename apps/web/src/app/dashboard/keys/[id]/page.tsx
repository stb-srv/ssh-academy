import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, schema } from "@ssh-academy/db";
import { DeleteKeyButton, RenameKey, RevokeKeyButton } from "@/components/keys/key-actions";
import { CodeBlock } from "@/components/lernen/code-block";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getKeyAccess, keyIsUsable } from "@/lib/access";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, KEY_MODE_LABELS } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "SSH-Key" };

export default async function KeyPage({ params }: PageProps<"/dashboard/keys/[id]">) {
  const { id } = await params;
  const session = await requireSession();
  const access = await getKeyAccess(session.user.id, id);
  if (!access) notFound();
  const { key, canManage } = access;
  const deployments = await db
    .select({ d: schema.keyDeployment, server: schema.server })
    .from(schema.keyDeployment)
    .innerJoin(schema.server, eq(schema.server.id, schema.keyDeployment.serverId))
    .where(eq(schema.keyDeployment.keyId, id))
    .orderBy(desc(schema.keyDeployment.updatedAt));
  const active = deployments.filter(({ d }) => d.status !== "removed");
  const file = key.type === "rsa" ? "id_rsa" : key.type === "ecdsa" ? "id_ecdsa" : "id_ed25519";

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted">
        <Link href="/dashboard/keys" className="hover:underline">
          SSH-Keys
        </Link>{" "}
        / {key.name}
      </nav>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{key.name}</h1>
          <Badge>{key.type}{key.bits ? ` ${key.bits} Bit` : ""}</Badge>
          <Badge tone={key.storageMode === "vault" ? "good" : "neutral"}>{KEY_MODE_LABELS[key.storageMode]}</Badge>
          {key.revokedAt && <Badge tone="bad">gesperrt am {formatDate(key.revokedAt)}</Badge>}
          {key.expiresAt && <Badge tone={key.expiresAt < new Date() ? "bad" : "neutral"}>gültig bis {formatDate(key.expiresAt)}</Badge>}
        </div>
        <p className="break-all font-mono text-sm text-muted">{key.fingerprintSha256}</p>
        {canManage && !key.revokedAt && (
          <div className="flex flex-wrap items-start gap-2">
            <RenameKey keyId={id} name={key.name} />
            {active.length > 0 && keyIsUsable(key) && <ButtonLink href={`/dashboard/keys/${id}/rotieren`} variant="secondary">Rotieren</ButtonLink>}
            <RevokeKeyButton keyId={id} deployments={active.length} />
          </div>
        )}
        {canManage && active.length === 0 && <DeleteKeyButton keyId={id} />}
      </header>

      {key.storageMode === "download" && (
        <Alert>Der Private Key liegt nur bei dir (Datei {file}). Geht er verloren, erzeuge einen neuen Key und sperre diesen hier.</Alert>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Public Key</h2>
        <CodeBlock className="whitespace-pre-wrap break-all">{key.publicKey}</CodeBlock>
        <h3 className="pt-2 text-sm font-semibold">Manuell auf einem Server eintragen</h3>
        <CodeBlock className="whitespace-pre-wrap break-all">{`mkdir -p ~/.ssh && chmod 700 ~/.ssh\necho '${key.publicKey.replace(/'/g, "")}' >> ~/.ssh/authorized_keys\nchmod 600 ~/.ssh/authorized_keys`}</CodeBlock>
        {key.storageMode !== "vault" && (
          <>
            <h3 className="pt-2 text-sm font-semibold">Eintrag für deine ~/.ssh/config</h3>
            <CodeBlock>{`Host meinserver\n    HostName server.example.de\n    User benutzer\n    IdentityFile ~/.ssh/${file}\n    IdentitiesOnly yes`}</CodeBlock>
            <p className="text-xs text-muted">
              Für PuTTY unter Windows: Private Key in PuTTYgen laden (Conversions &gt; Import key) und als .ppk speichern.
            </p>
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Auf diesen Servern eingetragen</h2>
        {deployments.length === 0 ? (
          <p className="text-sm text-muted">
            Noch nirgends. Öffne einen{" "}
            <Link href="/dashboard/server" className="text-primary hover:underline">
              Server
            </Link>{" "}
            und trage den Key dort ein.
          </p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {deployments.map(({ d, server }) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/dashboard/server/${server.id}`} className="hover:underline">
                  {server.name} <span className="font-mono text-muted">als {d.linuxUser}</span>
                </Link>
                <span className="text-muted">
                  {d.status === "deployed" ? "eingetragen" : d.status === "removed" ? "entfernt" : d.status === "failed" ? "Fehler" : d.status} ·{" "}
                  {formatDateTime(d.updatedAt)}
                </span>
                {d.lastError && <p className="w-full text-xs text-danger">{d.lastError}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
