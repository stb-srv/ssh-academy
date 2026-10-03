"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

type Passkey = { id: string; name: string | null; createdAt: string | null; backedUp: boolean };

export function PasskeyManager({ passkeys }: { passkeys: Passkey[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    const name = window.prompt("Wie soll der Passkey heißen? (z. B. „Laptop“ oder „YubiKey“)") ?? undefined;
    const res = await authClient.passkey.addPasskey({ name });
    if (res?.error) setError("Der Passkey konnte nicht angelegt werden.");
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Diesen Passkey wirklich entfernen?")) return;
    await authClient.passkey.deletePasskey({ id });
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Passkeys</h2>
          <p className="text-sm text-muted">
            Anmelden per Fingerabdruck, Gesichtserkennung oder Sicherheitsschlüssel. Sicherer als jedes
            Passwort und zählt als starke Anmeldung.
          </p>
        </div>
        <Button onClick={add}>Hinzufügen</Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {passkeys.length === 0 ? (
        <p className="text-sm text-muted">Noch kein Passkey eingerichtet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {p.name ?? "Passkey"}
                {p.createdAt && (
                  <span className="ml-2 text-muted">seit {new Date(p.createdAt).toLocaleDateString("de-DE")}</span>
                )}
              </span>
              <Button variant="ghost" onClick={() => remove(p.id)}>
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
