"use client";
import { useState } from "react";
import { CodeBlock } from "@/components/lernen/code-block";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { generateSshKey, KEY_TYPE_LABELS, type GeneratedKey, type SshKeyType } from "@/lib/ssh-keys";
import { inputClass, Labeled } from "./inputs";

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const FILE_NAMES: Record<SshKeyType, string> = { ed25519: "id_ed25519", ecdsa: "id_ecdsa", rsa: "id_rsa" };

export function KeyGenerator() {
  const [type, setType] = useState<SshKeyType>("ed25519");
  const [comment, setComment] = useState("ich@laptop");
  const [key, setKey] = useState<GeneratedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = FILE_NAMES[type];

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setKey(await generateSshKey(type, comment.trim()));
    } catch {
      setError("Dein Browser unterstützt diesen Key-Typ nicht. Probiere ECDSA oder einen aktuellen Browser.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <Labeled label="Typ" htmlFor="kg-type">
          <select id="kg-type" className={inputClass} value={type} onChange={(e) => setType(e.target.value as SshKeyType)}>
            {(Object.keys(KEY_TYPE_LABELS) as SshKeyType[]).map((t) => (
              <option key={t} value={t}>
                {KEY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Kommentar" htmlFor="kg-comment" hint="Hilft dir später, den Key zuzuordnen.">
          <input id="kg-comment" className={inputClass} value={comment} maxLength={100} onChange={(e) => setComment(e.target.value)} />
        </Labeled>
        <Button type="submit" disabled={busy} className="sm:mb-5">
          {busy ? "Erzeuge…" : "Key erzeugen"}
        </Button>
      </form>

      {error && <Alert tone="error">{error}</Alert>}

      {key && (
        <div className="space-y-5">
          <section className="space-y-2">
            <h2 className="font-semibold">Public Key ({file}.pub)</h2>
            <p className="text-sm text-muted">Diesen Teil darfst du weitergeben. Er kommt auf den Server in ~/.ssh/authorized_keys.</p>
            <CodeBlock className="whitespace-pre-wrap break-all">{key.publicKey}</CodeBlock>
            <p className="font-mono text-xs text-muted">
              {key.bits} Bit, {key.fingerprint}
            </p>
            <Button variant="secondary" type="button" onClick={() => download(`${file}.pub`, key.publicKey + "\n")}>
              {file}.pub herunterladen
            </Button>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">Private Key ({file})</h2>
            <Alert tone="warning">
              Dieser Teil ist geheim. Gib ihn nie weiter und lade ihn nirgends hoch. Er ist noch ohne Passphrase: setze nach dem
              Speichern gleich eine.
            </Alert>
            <Button type="button" onClick={() => download(file, key.privateKey)}>
              {file} herunterladen
            </Button>
            <p className="text-sm">So legst du die Dateien an die richtige Stelle (Linux und macOS):</p>
            <CodeBlock>
              {[
                "mkdir -p ~/.ssh && chmod 700 ~/.ssh",
                `mv ~/Downloads/${file} ~/Downloads/${file}.pub ~/.ssh/`,
                `chmod 600 ~/.ssh/${file}`,
                `ssh-keygen -p -f ~/.ssh/${file}   # Passphrase setzen`,
                `ssh-keygen -lf ~/.ssh/${file}.pub # Fingerprint vergleichen`,
              ].join("\n")}
            </CodeBlock>
          </section>
        </div>
      )}

      <Alert>
        Der Key entsteht mit der Web-Crypto-Schnittstelle deines Browsers und wird nicht an den Server geschickt. Für Keys, die
        wirklich wichtige Server schützen, ist <code className="font-mono">ssh-keygen</code> auf deinem eigenen Rechner trotzdem die
        beste Wahl, weil der Key dort gar nicht erst durch einen Browser geht.
      </Alert>
    </div>
  );
}
