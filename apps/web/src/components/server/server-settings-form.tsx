"use client";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { deleteServer, updateServer } from "@/app/dashboard/server/actions";
import { ActionButton } from "@/components/ui/action-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function ServerSettingsForm({ server }: { server: { id: string; name: string; port: number; defaultUser: string; tags: string[] } }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateServer.bind(null, server.id), undefined);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="set-name" name="name" label="Name" defaultValue={server.name} required />
          <Field id="set-port" name="port" type="number" label="Port" defaultValue={server.port} hint="Nach einer Änderung muss der Fingerprint neu bestätigt werden." />
          <Field id="set-user" name="defaultUser" label="Standard-Benutzer" defaultValue={server.defaultUser} />
          <Field id="set-tags" name="tags" label="Tags" defaultValue={server.tags.join(", ")} />
        </div>
        {state && (state.ok ? <Alert>Gespeichert.</Alert> : <Alert tone="error">{state.error}</Alert>)}
        <Button type="submit" variant="secondary" disabled={pending}>
          Speichern
        </Button>
      </form>
      <ActionButton
        variant="danger"
        confirm="Server wirklich aus der Plattform löschen? Auf dem Server selbst ändert sich dadurch nichts; eingetragene Keys bleiben dort."
        action={deleteServer.bind(null, server.id)}
        onSuccess={() => router.push("/dashboard/server")}
      >
        Server löschen
      </ActionButton>
    </div>
  );
}
