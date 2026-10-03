import type { Metadata } from "next";
import Link from "next/link";
import { CreateKeyForm } from "@/components/keys/create-key-form";
import { ownerTargets } from "@/lib/access";
import { requireSession } from "@/lib/session";
import { vaultForUser } from "../vault-info";

export const metadata: Metadata = { title: "Neuer SSH-Key" };

export default async function NewKeyPage() {
  const session = await requireSession();
  const [teams, vault] = await Promise.all([ownerTargets(session.user.id, { sshKey: ["create"] }), vaultForUser(session.user.id)]);
  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted">
        <Link href="/dashboard/keys" className="hover:underline">
          SSH-Keys
        </Link>{" "}
        / Neu
      </nav>
      <h1 className="text-2xl font-bold">Neuen SSH-Key erzeugen</h1>
      <p className="text-sm text-muted">
        Hardware-Keys (YubiKey, <code className="font-mono">ed25519-sk</code>) kannst du nur lokal mit ssh-keygen erzeugen und dann
        hier importieren. Siehe{" "}
        <Link href="/lernen/keys-erstellen/hardware-keys" className="text-primary hover:underline">
          Lektion Hardware-Keys
        </Link>
        .
      </p>
      <CreateKeyForm teams={teams} vault={vault.vault} vaultBlockedReason={vault.reason} />
    </div>
  );
}
