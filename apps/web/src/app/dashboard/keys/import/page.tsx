import type { Metadata } from "next";
import Link from "next/link";
import { ImportKeyForm } from "@/components/keys/import-key-form";
import { ownerTargets } from "@/lib/access";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Public Key importieren" };

export default async function ImportKeyPage() {
  const session = await requireSession();
  const teams = await ownerTargets(session.user.id, { sshKey: ["create"] });
  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted">
        <Link href="/dashboard/keys" className="hover:underline">
          SSH-Keys
        </Link>{" "}
        / Importieren
      </nav>
      <h1 className="text-2xl font-bold">Public Key importieren</h1>
      <p className="text-sm text-muted">
        Für Keys, die du schon auf deinem Rechner hast. Die Plattform kann ihn dann auf Server verteilen; verbinden musst du dich
        weiter von deinem Rechner aus.
      </p>
      <ImportKeyForm teams={teams} />
    </div>
  );
}
