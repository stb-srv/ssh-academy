"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteKey, renameKey, revokeKey } from "@/app/dashboard/keys/actions";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/select";

export function RenameKey({ keyId, name }: { keyId: string; name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
        Umbenennen
      </Button>
    );
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await renameKey(keyId, value);
        if (r.ok) {
          setEditing(false);
          router.refresh();
        }
      }}
    >
      <input aria-label="Neuer Name" className={controlClass} value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} />
      <Button type="submit">Speichern</Button>
    </form>
  );
}

export function RevokeKeyButton({ keyId, deployments }: { keyId: string; deployments: number }) {
  const [results, setResults] = useState<{ server: string; linuxUser: string; ok: boolean; error?: string }[] | null>(null);
  return (
    <div className="space-y-2">
      <ActionButton
        variant="danger"
        confirm={`Key sperren? Er wird von ${deployments} Server-Eintrag/Einträgen entfernt und kann nicht mehr genutzt werden. Das lässt sich nicht rückgängig machen.`}
        action={async () => {
          const r = await revokeKey(keyId);
          if (r.ok) setResults(r.results);
          return r.ok ? { ok: true, message: "Gesperrt." } : r;
        }}
      >
        Key sperren
      </ActionButton>
      {results && results.some((r) => !r.ok) && (
        <ul className="text-xs text-danger">
          {results
            .filter((r) => !r.ok)
            .map((r) => (
              <li key={`${r.server}-${r.linuxUser}`}>
                {r.server} ({r.linuxUser}): {r.error}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export function DeleteKeyButton({ keyId }: { keyId: string }) {
  const router = useRouter();
  return (
    <ActionButton variant="ghost" confirm="Key endgültig aus der Plattform löschen?" action={deleteKey.bind(null, keyId)} onSuccess={() => router.push("/dashboard/keys")}>
      Löschen
    </ActionButton>
  );
}
