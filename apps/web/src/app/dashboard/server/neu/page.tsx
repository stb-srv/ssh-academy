import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddServerForm } from "@/components/server/add-server-form";
import { ownerTargets } from "@/lib/access";
import { gatewayEnabled } from "@/lib/env";
import { getSecurityOverview } from "@/lib/security";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Server hinzufügen" };

export default async function NewServerPage() {
  const session = await requireSession();
  const security = await getSecurityOverview(session.user.id);
  if (!security.strongAuth || !gatewayEnabled) redirect("/dashboard/server");
  const teams = await ownerTargets(session.user.id, { server: ["create"] });
  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted">
        <Link href="/dashboard/server" className="hover:underline">
          Server
        </Link>{" "}
        / Hinzufügen
      </nav>
      <h1 className="text-2xl font-bold">Server hinzufügen</h1>
      <p className="text-sm text-muted">
        Die Plattform fragt zuerst nur den Host-Key ab, ohne sich anzumelden. Danach vergleichst du den Fingerprint und
        bestätigst ihn, genau wie beim ersten <code className="font-mono">ssh</code> von deinem Rechner.
      </p>
      <AddServerForm teams={teams} />
    </div>
  );
}
