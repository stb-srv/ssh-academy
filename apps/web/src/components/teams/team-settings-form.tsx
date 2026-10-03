"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

type Result = { ok: true } | { ok: false; error: string } | undefined;
type Settings = { name: string; recordSessions: boolean; idleTimeoutMinutes: number; maxSessionHours: number; maxCertMinutes: number };

export function TeamSettingsForm({ action, settings }: { action: (prev: unknown, form: FormData) => Promise<Result>; settings: Settings }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Einstellungen</h2>
      <form action={run} className="space-y-4">
        <Field id="ts-name" name="name" label="Team-Name" defaultValue={settings.name} required />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="recordSessions" defaultChecked={settings.recordSessions} className="mt-1" />
          <span>
            <span className="font-medium">Terminal-Sitzungen aufzeichnen</span>
            <span className="block text-muted">
              Admins können Sitzungen später abspielen. Wer sich verbindet, sieht einen Hinweis. Eingegebene Passwörter erscheinen nicht, weil das
              Terminal sie nicht anzeigt.
            </span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="ts-idle" name="idleTimeoutMinutes" type="number" min={1} max={240} label="Leerlauf-Timeout (Minuten)" defaultValue={settings.idleTimeoutMinutes} />
          <Field id="ts-max" name="maxSessionHours" type="number" min={1} max={24} label="Max. Sitzungsdauer (Stunden)" defaultValue={settings.maxSessionHours} />
          <Field id="ts-cert" name="maxCertMinutes" type="number" min={5} max={43200} label="Max. Zertifikats-Laufzeit (Minuten)" defaultValue={settings.maxCertMinutes} />
        </div>
        {state && (state.ok ? <Alert>Gespeichert.</Alert> : <Alert tone="error">{state.error}</Alert>)}
        <Button type="submit" disabled={pending}>
          Speichern
        </Button>
      </form>
    </Card>
  );
}

export function DeleteTeamCard({ name, action }: { name: string; action: (confirmName: string) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  return (
    <Card className="space-y-3 border-danger/40">
      <h2 className="font-semibold text-danger">Team löschen</h2>
      <p className="text-sm text-muted">
        Löscht das Team mit allen Team-Servern, Team-Keys, Gruppen und Freigaben aus der Plattform. Auf den Servern selbst ändert sich nichts:
        Eingetragene Keys bleiben dort, bis du sie entfernst. Gib zur Bestätigung den Namen „{name}“ ein.
      </p>
      <Field id="del-team" label="Team-Name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      {typed === name && (
        <ActionButton variant="danger" action={() => action(typed)} onSuccess={() => router.push("/dashboard/teams")}>
          Endgültig löschen
        </ActionButton>
      )}
    </Card>
  );
}
