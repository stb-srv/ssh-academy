import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UserWizard } from "@/components/server/user-wizard";
import { getServerAccess, keyIsUsable, listAccessibleKeys } from "@/lib/access";
import { authOptions } from "@/lib/op-auth";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Benutzer-Assistent" };

export default async function WizardPage({ params }: PageProps<"/dashboard/server/[id]/assistent">) {
  const { id } = await params;
  const session = await requireSession();
  const access = await getServerAccess(session.user.id, id);
  if (!access) notFound();
  if (!access.canManage || !access.server.hostKeyConfirmedAt) redirect(`/dashboard/server/${id}`);
  const [options, keys] = await Promise.all([authOptions(session.user.id, access), listAccessibleKeys(session.user.id)]);
  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted">
        <Link href={`/dashboard/server/${id}`} className="hover:underline">
          {access.server.name}
        </Link>{" "}
        / Benutzer-Assistent
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Benutzer mit sudo einrichten</h1>
        <p className="text-sm text-muted">
          Für Ubuntu 22.04/24.04 und Debian 12/13. Jeder Schritt zeigt den Befehl, bevor er ausgeführt wird, genau wie in den
          Lektionen zu{" "}
          <Link href="/lernen/benutzer-ubuntu-debian/adduser-oder-useradd" className="text-primary hover:underline">
            Benutzern und sudo
          </Link>
          .
        </p>
      </header>
      <UserWizard
        server={{ id, name: access.server.name, defaultUser: access.server.defaultUser, port: access.server.port }}
        authOptions={options}
        keys={keys
          .filter(({ key, canManage }) => canManage && keyIsUsable(key))
          .map(({ key }) => ({ id: key.id, name: key.name, publicKey: key.publicKey, vault: key.storageMode === "vault" }))}
      />
    </div>
  );
}
