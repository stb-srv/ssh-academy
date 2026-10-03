"use client";
import { Field } from "@/components/ui/field";
import { LocalDateTimeField } from "@/components/ui/local-datetime-field";
import { SelectField } from "@/components/ui/select";
import { ResettingForm } from "./forms";

type Option = { value: string; label: string };
type Result = { ok: true } | { ok: false; error: string } | undefined;

export function GrantForm({ action, subjects, targets }: { action: (prev: unknown, form: FormData) => Promise<Result>; subjects: { label: string; options: Option[] }[]; targets: { label: string; options: Option[] }[] }) {
  return (
    <ResettingForm action={action} submit="Freigabe anlegen" title="Neue Freigabe" success="Freigabe angelegt.">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField id="grant-subject" name="subject" label="Wer" required defaultValue="">
          <option value="" disabled>
            Bitte wählen
          </option>
          {subjects.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <SelectField id="grant-target" name="target" label="Auf welche Server" required defaultValue="">
          <option value="" disabled>
            Bitte wählen
          </option>
          {targets.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <Field id="grant-user" name="linuxUser" label="Als Linux-Benutzer" placeholder="z. B. deploy" required hint="Root-Freigaben nur, wenn es wirklich nötig ist." />
        <div />
        <LocalDateTimeField id="grant-from" name="validFrom" label="Gültig ab (optional)" />
        <LocalDateTimeField id="grant-until" name="validUntil" label="Gültig bis (optional)" hint="Zeitlich begrenzte Freigaben laufen von selbst ab." />
      </div>
    </ResettingForm>
  );
}
