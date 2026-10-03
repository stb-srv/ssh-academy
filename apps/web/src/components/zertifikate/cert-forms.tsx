"use client";
import { useActionState, useState } from "react";
import { createCaAction, installCaAction, signCertificateAction } from "@/app/dashboard/zertifikate/actions";
import { OwnerSelect, type OwnerOption } from "@/components/keys/owner-select";
import { CodeBlock } from "@/components/lernen/code-block";
import { AuthFields, type AuthOption } from "@/components/server/auth-fields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function CreateCaForm({ teams }: { teams: OwnerOption[] }) {
  const [state, action, pending] = useActionState(createCaAction, undefined);
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Neue Zertifizierungsstelle</h2>
      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ca-name" name="name" label="Name" placeholder="z. B. Produktion" required />
          <OwnerSelect teams={teams} />
        </div>
        <p className="text-xs text-muted">
          Der private Schlüssel der Stelle entsteht im SSH-Gateway und liegt nur verschlüsselt im Tresor. Niemand kann ihn herunterladen.
        </p>
        {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
        <Button type="submit" disabled={pending}>
          {pending ? "Erzeuge …" : "Anlegen"}
        </Button>
      </form>
    </Card>
  );
}

type CaOption = { id: string; label: string; principals: string[] | "any"; maxMinutes: number };

export function SignCertForm({ cas, keys, defaultUser }: { cas: CaOption[]; keys: { id: string; name: string; type: string }[]; defaultUser: string }) {
  const [state, action, pending] = useActionState(signCertificateAction, undefined);
  const [caId, setCaId] = useState(cas[0]?.id ?? "");
  const [keyId, setKeyId] = useState(keys[0]?.id ?? "");
  // Fallback auf die erste Stelle, falls die Liste nach dem ersten Rendern dazukam
  const ca = cas.find((c) => c.id === caId) ?? cas[0];
  const keyName = state?.ok ? `id_${state.keyType.replace(/-sk$/, "_sk")}-cert.pub` : "";
  if (!cas.length) return null;
  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Zertifikat ausstellen</h2>
      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField id="cert-ca" name="caId" label="Zertifizierungsstelle" value={ca?.id ?? ""} onChange={(e) => setCaId(e.target.value)}>
            {cas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </SelectField>
          <SelectField id="cert-key" name="keyId" label="Für Key" value={keyId} onChange={(e) => setKeyId(e.target.value)}>
            {keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} ({k.type})
              </option>
            ))}
            <option value="">Public Key einfügen …</option>
          </SelectField>
        </div>
        {!keyId && (
          <div className="space-y-1">
            <label htmlFor="cert-pub" className="block text-sm font-medium">
              Public Key
            </label>
            <textarea id="cert-pub" name="publicKey" rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs" placeholder="ssh-ed25519 AAAA… name@rechner" />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {ca?.principals === "any" ? (
            <Field id="cert-principals" name="principals" label="Linux-Benutzer (Principals)" defaultValue={defaultUser} hint="Mehrere mit Komma trennen. Das Zertifikat gilt nur für diese Benutzer." required />
          ) : (
            <SelectField id="cert-principals" name="principals" label="Linux-Benutzer (Principal)" hint="Nur Benutzer, die dir im Team freigegeben sind.">
              {(ca?.principals ?? []).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </SelectField>
          )}
          <SelectField id="cert-minutes" name="minutes" label="Gültig für" defaultValue={String(Math.min(480, ca?.maxMinutes ?? 480))}>
            {[15, 60, 240, 480, 1440, 10080, 43200]
              .filter((m) => m <= (ca?.maxMinutes ?? 0))
              .map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} Minuten` : m === 60 ? "1 Stunde" : m < 1440 ? `${m / 60} Stunden` : m === 1440 ? "1 Tag" : `${m / 1440} Tage`}
                </option>
              ))}
          </SelectField>
        </div>
        {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
        <Button type="submit" disabled={pending}>
          {pending ? "Signiere …" : "Zertifikat ausstellen"}
        </Button>
      </form>
      {state?.ok && (
        <div className="space-y-3 border-t border-border pt-4">
          <Alert>
            Zertifikat Nr. {state.serial} ist gültig bis {formatDateTime(state.validBefore)}.
          </Alert>
          <CodeBlock>{state.certificate}</CodeBlock>
          <Button type="button" variant="secondary" onClick={() => download(keyName, state.certificate + "\n")}>
            {keyName} herunterladen
          </Button>
          <div className="text-sm text-muted">
            <p>
              Lege die Datei neben deinen Private Key, also nach <code className="font-mono">~/.ssh/{keyName}</code>. ssh nutzt sie dann automatisch:
            </p>
            <CodeBlock>{`ssh-keygen -L -f ~/.ssh/${keyName}   # Zertifikat ansehen\nssh ${defaultUser}@dein-server`}</CodeBlock>
          </div>
        </div>
      )}
    </Card>
  );
}

export function InstallCaForm({ serverId, cas, authOptions, defaultUser, currentCaId }: { serverId: string; cas: { id: string; name: string }[]; authOptions: AuthOption[]; defaultUser: string; currentCaId: string | null }) {
  const [state, action, pending] = useActionState(installCaAction.bind(null, serverId), undefined);
  return (
    <form action={action} className="space-y-3">
      <SelectField id="ica-ca" name="caId" label="Zertifizierungsstelle" defaultValue={currentCaId ?? cas[0]?.id}>
        {cas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <AuthFields options={authOptions} defaultUser={defaultUser} needsRoot idPrefix="ica" />
      {state && (state.ok ? <Alert>{state.message}</Alert> : <Alert tone="error">{state.error}</Alert>)}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Richte ein …" : "Auf dem Server hinterlegen"}
      </Button>
    </form>
  );
}
