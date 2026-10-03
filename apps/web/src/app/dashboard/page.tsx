import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { getSecurityOverview } from "@/lib/security";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const security = await getSecurityOverview(session.user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Hallo {session.user.name.split(" ")[0]}</h1>

      {!security.strongAuth && (
        <Alert tone="warning">
          Richte einen Passkey oder die Zwei-Faktor-Anmeldung ein. Ohne sie kannst du später keine Server
          verwalten und keine Keys im Tresor speichern.{" "}
          <Link href="/dashboard/sicherheit" className="font-medium underline">
            Jetzt einrichten
          </Link>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Passkeys" value={security.passkeys.length} />
        <Stat label="Zwei-Faktor (App)" value={security.totpEnabled ? "aktiv" : "aus"} />
        <Stat label="Pocket ID" value={security.pocketIdLinked ? "verbunden" : "nicht verbunden"} />
      </div>

      <Card>
        <h2 className="font-semibold">Wie geht es weiter?</h2>
        <p className="mt-2 text-sm text-muted">
          SSH-Keys erzeugen, Server hinzufügen und das Web-Terminal kommen mit der nächsten Ausbaustufe.
          Bis dahin kannst du im{" "}
          <Link href="/lernen" className="text-primary hover:underline">
            Lernbereich
          </Link>{" "}
          starten.
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </Card>
  );
}
