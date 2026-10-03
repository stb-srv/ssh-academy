"use client";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { controlClass, SelectField } from "@/components/ui/select";

type Result = { ok: true } | { ok: false; error: string } | undefined;
type FormAction = (prev: unknown, form: FormData) => Promise<Result>;

/** Formular mit Ergebnisanzeige, das sich nach Erfolg leert */
export function ResettingForm({ action, children, submit, success, title }: { action: FormAction; children: ReactNode; submit: string; success?: string; title?: string }) {
  // Nach Erfolg werden die Felder neu aufgebaut und damit geleert
  const [generation, setGeneration] = useState(0);
  const [state, run, pending] = useActionState(async (prev: unknown, form: FormData) => {
    const result = await action(prev, form);
    if (result?.ok) setGeneration((g) => g + 1);
    return result;
  }, undefined);
  return (
    <Card>
      {title && <h2 className="mb-3 font-semibold">{title}</h2>}
      <form action={run} className="space-y-3">
        <div key={generation} className="space-y-3">
          {children}
        </div>
        {state && (state.ok ? success && <Alert>{success}</Alert> : <Alert tone="error">{state.error}</Alert>)}
        <Button type="submit" disabled={pending}>
          {pending ? "Bitte warten …" : submit}
        </Button>
      </form>
    </Card>
  );
}

export function NamedGroupForm({ action, title, placeholder }: { action: FormAction; title: string; placeholder: string }) {
  return (
    <ResettingForm action={action} submit="Anlegen" title={title}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="group-name" name="name" label="Name" placeholder={placeholder} required />
        <Field id="group-desc" name="description" label="Beschreibung (optional)" />
      </div>
    </ResettingForm>
  );
}

export function InviteForm({ action, roles }: { action: FormAction; roles: { value: string; label: string }[] }) {
  return (
    <ResettingForm action={action} submit="Einladung senden" title="Person einladen" success="Einladung verschickt. Sie gilt 48 Stunden.">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <Field id="invite-email" name="email" type="email" label="E-Mail-Adresse" required />
        <SelectField id="invite-role" name="role" label="Rolle" defaultValue="member">
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </SelectField>
      </div>
    </ResettingForm>
  );
}

/** Auswahl, die beim Ändern sofort eine Server-Action aufruft */
export function InstantSelect({ value, options, action, label }: { value: string; options: { value: string; label: string }[]; action: (v: string) => Promise<Result>; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <select
        aria-label={label}
        className={`${controlClass} w-auto`}
        defaultValue={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const select = e.target;
          setError(null);
          start(async () => {
            const r = await action(next);
            if (r && !r.ok) {
              setError(r.error);
              select.value = value;
            }
            router.refresh();
          });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

/** Checkbox-Liste für Gruppenmitglieder oder Server einer Gruppe */
export function MembershipEditor({
  options,
  selected,
  action,
  empty,
}: {
  options: { id: string; label: string; hint?: string }[];
  selected: string[];
  action: (ids: string[]) => Promise<Result>;
  empty: string;
}) {
  const router = useRouter();
  const [ids, setIds] = useState(new Set(selected));
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (!options.length) return <p className="text-sm text-muted">{empty}</p>;
  const dirty = ids.size !== selected.length || selected.some((s) => !ids.has(s));
  return (
    <div className="space-y-3">
      <ul className="grid gap-1 sm:grid-cols-2">
        {options.map((o) => (
          <li key={o.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ids.has(o.id)}
                onChange={(e) => {
                  const next = new Set(ids);
                  if (e.target.checked) next.add(o.id);
                  else next.delete(o.id);
                  setIds(next);
                  setMessage(null);
                }}
              />
              <span>{o.label}</span>
              {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await action([...ids]);
              setMessage(r?.ok ? { ok: true, text: "Gespeichert." } : { ok: false, text: r?.error ?? "Fehler" });
              router.refresh();
            })
          }
        >
          {pending ? "Speichere …" : "Auswahl speichern"}
        </Button>
        {message && <span className={`text-xs ${message.ok ? "text-primary" : "text-danger"}`}>{message.text}</span>}
      </div>
    </div>
  );
}
