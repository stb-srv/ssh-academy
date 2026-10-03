"use client";
import Link from "next/link";
import { useState } from "react";
import { rotateKey } from "@/app/dashboard/keys/actions";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import type { SshKeyType } from "@/lib/ssh-keys";
import { CreateKeyForm } from "./create-key-form";
import type { OwnerOption } from "./owner-select";

type Result = { server: string; linuxUser: string; ok: boolean; error?: string };

export function RotateKeyFlow(props: {
  oldKey: { id: string; name: string; type: SshKeyType; mode: "download" | "vault"; owner: string };
  teams: OwnerOption[];
  vault: { version: number; publicKey: string } | null;
  vaultBlockedReason: string | null;
}) {
  const [phase, setPhase] = useState<"create" | "running" | "done">("create");
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  async function run(newKeyId: string) {
    setPhase("running");
    const r = await rotateKey(props.oldKey.id, newKeyId);
    if (!r.ok) {
      setError(r.error);
      setPhase("done");
      return;
    }
    setResults(r.results);
    setCompleted(r.completed);
    setPhase("done");
  }

  if (phase === "running") return <Alert>Trage den neuen Key auf allen Servern ein und entferne danach den alten …</Alert>;
  if (phase === "done")
    return (
      <Card className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {!error && (completed ? <Alert>Fertig: Der neue Key ist überall eingetragen, der alte ist entfernt und gesperrt.</Alert> : <Alert tone="warning">Nicht überall erfolgreich. Der alte Key bleibt gültig, bis alle Server umgestellt sind.</Alert>)}
        <ul className="space-y-1 text-sm">
          {results.map((r) => (
            <li key={`${r.server}-${r.linuxUser}`} className={r.ok ? "" : "text-danger"}>
              {r.ok ? "✓" : "✗"} {r.server} ({r.linuxUser}) {r.error}
            </li>
          ))}
        </ul>
        <Link href="/dashboard/keys" className="text-sm text-primary hover:underline">
          Zur Key-Übersicht
        </Link>
      </Card>
    );
  return (
    <CreateKeyForm
      teams={props.teams}
      vault={props.vault}
      vaultBlockedReason={props.vaultBlockedReason}
      preset={{ name: `${props.oldKey.name} (neu)`, type: props.oldKey.type, mode: props.oldKey.mode, owner: props.oldKey.owner }}
      onCreated={(id) => void run(id)}
    />
  );
}
