"use client";
import { useState } from "react";
import { Field } from "./field";

/** datetime-local in der Zeitzone des Browsers; an den Server geht ein ISO-Zeitstempel */
export function LocalDateTimeField({ name, id, label, hint }: { name: string; id: string; label: string; hint?: string }) {
  const [iso, setIso] = useState("");
  return (
    <>
      <Field
        id={id}
        type="datetime-local"
        label={label}
        hint={hint}
        onChange={(e) => {
          const d = e.target.value ? new Date(e.target.value) : null;
          setIso(d && !Number.isNaN(d.getTime()) ? d.toISOString() : "");
        }}
      />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}
