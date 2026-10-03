import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listAccessibleKeys } from "@/lib/access";
import { formatDate, KEY_MODE_LABELS } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "SSH-Keys" };

export default async function KeysPage() {
  const session = await requireSession();
  const keys = await listAccessibleKeys(session.user.id);
  const soon = Date.now() + 14 * 86400_000;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">SSH-Keys</h1>
        <div className="flex gap-2">
          <ButtonLink href="/dashboard/keys/import" variant="secondary">
            Public Key importieren
          </ButtonLink>
          <ButtonLink href="/dashboard/keys/neu">Neuen Key erzeugen</ButtonLink>
        </div>
      </div>
      <p className="text-sm text-muted">
        Standardmäßig speichert die Plattform nur deinen Public Key. Nur Keys im Tresor können für das Web-Terminal und für
        automatische Aufgaben genutzt werden.
      </p>

      {keys.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Noch keine Keys. Erzeuge einen neuen oder importiere den Public Key von deinem Rechner.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {keys.map(({ key, teamName }) => {
            const expired = key.expiresAt && key.expiresAt.getTime() < Date.now();
            const expiring = !expired && key.expiresAt && key.expiresAt.getTime() < soon;
            return (
              <li key={key.id}>
                <Link href={`/dashboard/keys/${key.id}`} className="block rounded-xl border border-border bg-card p-4 hover:border-primary">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <Badge>{key.type}</Badge>
                    <Badge tone={key.storageMode === "vault" ? "good" : "neutral"}>{KEY_MODE_LABELS[key.storageMode]}</Badge>
                    {teamName && <Badge>Team {teamName}</Badge>}
                    {key.revokedAt && <Badge tone="bad">gesperrt</Badge>}
                    {expired && <Badge tone="bad">abgelaufen</Badge>}
                    {expiring && <Badge tone="warn">läuft am {formatDate(key.expiresAt)} ab</Badge>}
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-muted">{key.fingerprintSha256}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {keys.some(({ key }) => key.expiresAt && !key.revokedAt && key.expiresAt.getTime() < soon) && (
        <Alert tone="warning">Mindestens ein Key läuft bald ab. Nutze die Rotation, um ihn überall durch einen neuen zu ersetzen.</Alert>
      )}
    </div>
  );
}
