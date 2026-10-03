"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { importKey } from "@/app/dashboard/keys/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { controlClass } from "@/components/ui/select";
import { OwnerSelect, type OwnerOption } from "./owner-select";

export function ImportKeyForm({ teams }: { teams: OwnerOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const result = await importKey({
      name: String(form.get("name")),
      owner: String(form.get("owner") ?? "personal"),
      publicKey: String(form.get("publicKey")),
      expiresAt: String(form.get("expiresAt") ?? "") || undefined,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push(`/dashboard/keys/${result.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="pk" className="block text-sm font-medium">
            Public Key
          </label>
          <textarea id="pk" name="publicKey" required rows={4} className={`${controlClass} font-mono`} placeholder="ssh-ed25519 AAAA… anna@laptop" />
          <p className="text-xs text-muted">
            Inhalt deiner <code className="font-mono">.pub</code>-Datei, z. B. von <code className="font-mono">cat ~/.ssh/id_ed25519.pub</code>.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="imp-name" name="name" label="Name" required maxLength={80} placeholder="z. B. Desktop zu Hause" />
          <Field id="imp-exp" name="expiresAt" type="date" label="Läuft ab (optional)" />
          <OwnerSelect teams={teams} />
        </div>
      </Card>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" disabled={busy}>
        Importieren
      </Button>
    </form>
  );
}
