"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { deployKeyAction } from "@/app/dashboard/server/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";
import { AuthFields, type AuthOption } from "./auth-fields";

/** Aufklappbarer Bereich, der nach dem Eintragen offen bleibt (damit das Ergebnis sichtbar ist) */
export function DeployKeyPanel({ initiallyOpen, ...props }: Parameters<typeof DeployKeyForm>[0] & { initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details className="rounded-lg border border-border p-4" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">Key eintragen</summary>
      <div className="mt-4">
        <DeployKeyForm {...props} />
      </div>
    </details>
  );
}

export function DeployKeyForm({
  serverId,
  keys,
  authOptions,
  defaultUser,
  allowedUsers,
}: {
  serverId: string;
  keys: { id: string; name: string; mode: string }[];
  authOptions: AuthOption[];
  defaultUser: string;
  allowedUsers: string[] | "any";
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(deployKeyAction.bind(null, serverId), undefined);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (keys.length === 0) return <p className="text-sm text-muted">Du hast noch keinen Key, den du hier eintragen kannst.</p>;
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField id="dep-key" name="keyId" label="Key">
          {keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name} ({k.mode})
            </option>
          ))}
        </SelectField>
        {allowedUsers === "any" ? (
          <Field id="dep-target" name="linuxUser" label="Für Linux-Benutzer" defaultValue={defaultUser} required />
        ) : (
          <SelectField id="dep-target" name="linuxUser" label="Für Linux-Benutzer">
            {allowedUsers.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </SelectField>
        )}
      </div>
      <AuthFields options={authOptions} defaultUser={defaultUser} needsRoot idPrefix="dep" />
      {state && (state.ok ? <Alert>{state.message}</Alert> : <Alert tone="error">{state.error}</Alert>)}
      <Button type="submit" disabled={pending}>
        {pending ? "Trage ein …" : "Key eintragen"}
      </Button>
    </form>
  );
}
