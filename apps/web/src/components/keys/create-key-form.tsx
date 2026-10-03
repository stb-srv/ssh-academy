"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createKey } from "@/app/dashboard/keys/actions";
import { CodeBlock } from "@/components/lernen/code-block";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";
import { generateSshKey, KEY_TYPE_LABELS, type SshKeyType } from "@/lib/ssh-keys";
import { importVaultPublicKey, seal } from "@ssh-academy/ssh/vault";
import { OwnerSelect, type OwnerOption } from "./owner-select";

const FILE_NAMES: Record<SshKeyType, string> = { ed25519: "id_ed25519", ecdsa: "id_ecdsa", rsa: "id_rsa" };

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  teams: OwnerOption[];
  vault: { version: number; publicKey: string } | null;
  vaultBlockedReason: string | null;
  /** Nach dem Speichern aufrufen statt zur Detailseite zu springen (Rotation) */
  onCreated?: (id: string) => void;
  preset?: { name?: string; type?: SshKeyType; mode?: "download" | "vault"; owner?: string };
};

export function CreateKeyForm({ teams, vault, vaultBlockedReason, onCreated, preset }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"download" | "vault">(preset?.mode ?? "download");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; file: string; privateKey: string; publicKey: string } | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const type = form.get("type") as SshKeyType;
    setBusy(true);
    setError(null);
    try {
      const key = await generateSshKey(type, String(form.get("comment") ?? "").trim());
      let sealed;
      if (mode === "vault") {
        if (!vault) throw new Error(vaultBlockedReason ?? "Der Tresor ist nicht verfügbar.");
        // Der Private Key wird hier im Browser versiegelt; nur das Gateway kann ihn öffnen
        sealed = await seal(key.privateKey, await importVaultPublicKey(vault.publicKey), vault.version);
      }
      const result = await createKey({
        name: String(form.get("name")),
        owner: String(form.get("owner") ?? "personal"),
        publicKey: key.publicKey,
        expiresAt: String(form.get("expiresAt") ?? "") || undefined,
        mode,
        sealed,
      });
      if (!result.ok) throw new Error(result.error);
      if (mode === "vault") {
        if (onCreated) onCreated(result.id);
        else router.push(`/dashboard/keys/${result.id}`);
        return;
      }
      setCreated({ id: result.id, file: FILE_NAMES[type], privateKey: key.privateKey, publicKey: key.publicKey });
    } catch (err) {
      setError((err as Error).message || "Der Key konnte nicht erzeugt werden.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Card className="space-y-4">
        <Alert tone="warning">
          <strong>Jetzt herunterladen:</strong> Der Private Key wird nur dieses eine Mal angezeigt und nicht gespeichert.
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              download(created.file, created.privateKey);
              setDownloaded(true);
            }}
          >
            {created.file} herunterladen
          </Button>
          <Button type="button" variant="secondary" onClick={() => download(`${created.file}.pub`, created.publicKey + "\n")}>
            {created.file}.pub herunterladen
          </Button>
        </div>
        <p className="text-sm">Danach auf deinem Rechner (Linux und macOS):</p>
        <CodeBlock>
          {[
            `mv ~/Downloads/${created.file} ~/Downloads/${created.file}.pub ~/.ssh/`,
            `chmod 600 ~/.ssh/${created.file}`,
            `ssh-keygen -p -f ~/.ssh/${created.file}   # Passphrase setzen`,
          ].join("\n")}
        </CodeBlock>
        {onCreated ? (
          <Button type="button" disabled={!downloaded} onClick={() => onCreated(created.id)}>
            Weiter mit der Rotation
          </Button>
        ) : (
          <ButtonLink href={`/dashboard/keys/${created.id}`} variant={downloaded ? "primary" : "secondary"}>
            {downloaded ? "Weiter zum Key" : "Ohne Download weiter (Key ist dann unbrauchbar)"}
          </ButtonLink>
        )}
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field id="key-name" name="name" label="Name" placeholder="z. B. Laptop Arbeit" defaultValue={preset?.name} required maxLength={80} />
        <Field id="key-comment" name="comment" label="Kommentar im Key" placeholder="anna@laptop" maxLength={100} />
        <SelectField id="key-type" name="type" label="Typ" defaultValue={preset?.type ?? "ed25519"}>
          {(Object.keys(KEY_TYPE_LABELS) as SshKeyType[]).map((t) => (
            <option key={t} value={t}>
              {KEY_TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <Field id="key-expires" name="expiresAt" type="date" label="Läuft ab (optional)" hint="Danach kann der Key nicht mehr genutzt werden." />
        {teams.length > 0 && <OwnerSelect teams={teams} defaultValue={preset?.owner} />}
      </Card>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Wo soll der Private Key liegen?</legend>
        <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${mode === "download" ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
          <input type="radio" name="mode" checked={mode === "download"} onChange={() => setMode("download")} className="mt-1 accent-[var(--primary)]" />
          <span>
            <span className="font-medium">Nur herunterladen (empfohlen)</span>
            <span className="block text-sm text-muted">
              Der Private Key entsteht in deinem Browser und wird nur heruntergeladen. Die Plattform speichert nur den Public Key.
            </span>
          </span>
        </label>
        <label
          className={`flex gap-3 rounded-xl border p-4 ${vault ? "cursor-pointer" : "opacity-60"} ${mode === "vault" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
        >
          <input type="radio" name="mode" disabled={!vault} checked={mode === "vault"} onChange={() => setMode("vault")} className="mt-1 accent-[var(--primary)]" />
          <span>
            <span className="font-medium">Im Tresor speichern</span>
            <span className="block text-sm text-muted">
              Nötig für das Web-Terminal und automatische Aufgaben. Der Key wird im Browser verschlüsselt; entschlüsseln kann ihn nur
              das SSH-Gateway.
            </span>
            {vaultBlockedReason && (
              <span className="mt-1 block text-sm text-warning">
                {vaultBlockedReason}{" "}
                {vaultBlockedReason.includes("Passkey") && (
                  <Link href="/dashboard/sicherheit" className="underline">
                    Jetzt einrichten
                  </Link>
                )}
              </span>
            )}
          </span>
        </label>
      </fieldset>

      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" disabled={busy}>
        {busy ? "Erzeuge Key …" : "Key erzeugen"}
      </Button>
    </form>
  );
}
