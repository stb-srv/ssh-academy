import type { Metadata } from "next";
import Link from "next/link";
import { CreateCaForm, SignCertForm } from "@/components/zertifikate/cert-forms";
import { CodeBlock } from "@/components/lernen/code-block";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { keyIsUsable, listAccessibleKeys, ownerTargets } from "@/lib/access";
import { listCaAccess, recentCertificates } from "@/lib/certificates";
import { gatewayEnabled } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { CA_FILE, CA_DROPIN } from "@ssh-academy/ssh/ops";

export const metadata: Metadata = { title: "Zertifikate" };

export default async function CertificatesPage() {
  const session = await requireSession();
  const [cas, keys, teams] = await Promise.all([
    listCaAccess(session.user.id),
    listAccessibleKeys(session.user.id),
    ownerTargets(session.user.id, { server: ["update"] }),
  ]);
  const certs = await recentCertificates(
    cas.map((c) => c.ca.id),
    session.user.id,
    cas.filter((c) => c.canManage).map((c) => c.ca.id),
  );
  const ownKeys = keys.filter((k) => k.key.ownerUserId === session.user.id && keyIsUsable(k.key));
  const now = new Date();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">SSH-Zertifikate</h1>
      <p className="text-sm text-muted">
        Statt jeden Key auf jedem Server einzutragen, vertraut der Server einer Zertifizierungsstelle. Sie stellt kurzlebige Zertifikate für einzelne
        Linux-Benutzer aus, die von selbst ablaufen. Mehr dazu in der Lektion{" "}
        <Link href="/lernen/fortgeschritten/ssh-zertifikate" className="text-primary underline">
          SSH-Zertifikate
        </Link>
        .
      </p>
      {!gatewayEnabled && (
        <Card>
          <p className="text-sm text-muted">Zertifikate brauchen das SSH-Gateway. Es ist auf dieser Installation nicht eingerichtet.</p>
        </Card>
      )}

      {cas.map(({ ca, teamName, canManage }) => (
        <Card key={ca.id} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{ca.name}</h2>
            <Badge>{teamName ? `Team ${teamName}` : "Persönlich"}</Badge>
            <span className="font-mono text-xs text-muted">{ca.fingerprintSha256}</span>
          </div>
          {canManage && (
            <details>
              <summary className="cursor-pointer text-sm text-primary">Auf einem Server einrichten</summary>
              <div className="mt-2 space-y-2 text-sm text-muted">
                <p>Am einfachsten über die Server-Seite („Zertifikate“). Von Hand geht es so:</p>
                <CodeBlock>{`echo '${ca.publicKey}' | sudo tee ${CA_FILE}\necho 'TrustedUserCAKeys ${CA_FILE}' | sudo tee ${CA_DROPIN}\nsudo sshd -t && sudo systemctl reload ssh`}</CodeBlock>
              </div>
            </details>
          )}
        </Card>
      ))}

      {gatewayEnabled && (
        <>
          <SignCertForm
            cas={cas.map((c) => ({ id: c.ca.id, label: c.teamName ? `${c.ca.name} (Team ${c.teamName})` : c.ca.name, principals: c.principals, maxMinutes: c.maxMinutes }))}
            keys={ownKeys.map((k) => ({ id: k.key.id, name: k.key.name, type: k.key.type }))}
            defaultUser={session.user.email.split("@")[0]!.replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "deploy"}
          />
          <CreateCaForm teams={teams} />
        </>
      )}

      {certs.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Ausgestellte Zertifikate</h2>
          <ul className="divide-y divide-border text-sm">
            {certs.map(({ cert, userName, caName }) => (
              <li key={cert.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-36 shrink-0 text-muted">{formatDateTime(cert.createdAt)}</span>
                <span className="min-w-0 flex-1">
                  Nr. {cert.serial.toString()} von {caName} für <span className="font-medium">{userName ?? "?"}</span> als{" "}
                  <code className="font-mono">{cert.principals.join(", ")}</code>
                </span>
                {cert.validBefore > now ? <Badge tone="good">gültig bis {formatDateTime(cert.validBefore)}</Badge> : <Badge>abgelaufen</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
