"use client";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";

export type AuthOption = { value: string; label: string; username: string | null };

/**
 * Formularfelder „Anmelden mit“: Tresor-Key, Verwaltungs-Key oder Passwort.
 * needsRoot: zeigt das sudo-Passwort an, wenn der Login-Benutzer nicht root ist.
 */
export function AuthFields({
  options,
  defaultUser,
  needsRoot,
  idPrefix,
}: {
  options: AuthOption[];
  defaultUser: string;
  needsRoot: boolean;
  idPrefix: string;
}) {
  const [value, setValue] = useState(options[0]?.value ?? "password");
  const [username, setUsername] = useState(defaultUser);
  const option = options.find((o) => o.value === value);
  const loginUser = option?.username ?? username;
  const showSudo = needsRoot && loginUser !== "root" && value !== "password";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField id={`${idPrefix}-auth`} name="auth" label="Anmelden mit" value={value} onChange={(e) => setValue(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      {value === "password" && (
        <>
          <Field id={`${idPrefix}-user`} name="username" label="Benutzer" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
          <Field
            id={`${idPrefix}-pw`}
            name="password"
            type="password"
            label="Passwort"
            required
            autoComplete="off"
            hint={needsRoot && username !== "root" ? "Wird auch für sudo genutzt." : "Nur für diese Aktion, wird nie gespeichert."}
          />
        </>
      )}
      {showSudo && (
        <Field
          id={`${idPrefix}-sudo`}
          name="sudoPassword"
          type="password"
          label={`sudo-Passwort von ${loginUser} (falls nötig)`}
          autoComplete="off"
          hint="Leer lassen, wenn sudo ohne Passwort erlaubt ist."
        />
      )}
    </div>
  );
}
