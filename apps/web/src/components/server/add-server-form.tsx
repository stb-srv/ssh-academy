"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { addServer } from "@/app/dashboard/server/actions";
import { OwnerSelect, type OwnerOption } from "@/components/keys/owner-select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

export function AddServerForm({ teams }: { teams: OwnerOption[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addServer, undefined);
  useEffect(() => {
    if (state?.ok) router.push(`/dashboard/server/${state.id}`);
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field id="srv-name" name="name" label="Name" placeholder="z. B. Webserver" required maxLength={80} />
        <Field id="srv-host" name="host" label="Adresse" placeholder="server.example.de oder 203.0.113.10" required />
        <Field id="srv-port" name="port" type="number" label="Port" defaultValue={22} min={1} max={65535} required />
        <Field
          id="srv-user"
          name="defaultUser"
          label="Standard-Benutzer"
          defaultValue="root"
          required
          hint="Mit diesem Benutzer verwaltet die Plattform den Server (bei neuen Servern meist root)."
        />
        <Field id="srv-tags" name="tags" label="Tags (optional)" placeholder="produktion, web" />
        <OwnerSelect teams={teams} />
      </Card>
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Frage Host-Key ab …" : "Hinzufügen und Fingerprint abfragen"}
      </Button>
    </form>
  );
}
