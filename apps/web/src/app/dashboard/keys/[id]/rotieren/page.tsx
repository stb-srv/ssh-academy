import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RotateKeyFlow } from "@/components/keys/rotate-key-flow";
import { getKeyAccess, ownerTargets } from "@/lib/access";
import { requireSession } from "@/lib/session";
import type { SshKeyType } from "@/lib/ssh-keys";
import { vaultForUser } from "../../vault-info";

export const metadata: Metadata = { title: "Key rotieren" };

export default async function RotatePage({ params }: PageProps<"/dashboard/keys/[id]/rotieren">) {
  const { id } = await params;
  const session = await requireSession();
  const access = await getKeyAccess(session.user.id, id);
  if (!access?.canManage) notFound();
  const { key } = access;
  const [teams, vault] = await Promise.all([ownerTargets(session.user.id, { sshKey: ["create"] }), vaultForUser(session.user.id)]);
  const type: SshKeyType = key.type === "rsa" || key.type === "ecdsa" ? key.type : "ed25519";
  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted">
        <Link href={`/dashboard/keys/${id}`} className="hover:underline">
          {key.name}
        </Link>{" "}
        / Rotieren
      </nav>
      <h1 className="text-2xl font-bold">Key rotieren</h1>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Neuen Key erzeugen (gleiche Einstellungen vorausgefüllt).</li>
        <li>Die Plattform trägt ihn auf allen Servern ein, auf denen der alte liegt.</li>
        <li>Erst wenn das überall geklappt hat, wird der alte Key entfernt und gesperrt.</li>
      </ol>
      <p className="text-sm text-muted">
        Für das automatische Eintragen braucht die Plattform eine Anmeldung: den alten Key selbst (wenn er im Tresor liegt) oder
        den Verwaltungs-Key des Servers.
      </p>
      <RotateKeyFlow
        oldKey={{ id, name: key.name, type, mode: key.storageMode === "vault" ? "vault" : "download", owner: key.organizationId ?? "personal" }}
        teams={teams}
        vault={vault.vault}
        vaultBlockedReason={vault.reason}
      />
    </div>
  );
}
