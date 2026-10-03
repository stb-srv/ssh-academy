"use client";
import { useState } from "react";
import { CodeBlock } from "@/components/lernen/code-block";
import { buildConfigEntry, DEFAULT_COMMAND_INPUT, RECIPES, type CommandInput } from "@/lib/tools/befehle";
import { inputClass, Labeled } from "./inputs";

type FieldDef = { key: keyof CommandInput; label: string; type?: "number"; hint?: string };

const FIELDS: FieldDef[] = [
  { key: "user", label: "Benutzer" },
  { key: "host", label: "Server (Name oder IP)" },
  { key: "port", label: "Port", type: "number" },
  { key: "keyFile", label: "Private-Key-Datei", hint: "Leer lassen, um den Standard-Key zu nutzen." },
  { key: "alias", label: "Kurzname für ~/.ssh/config" },
  { key: "jumpHost", label: "Sprung-Host (optional)", hint: "z. B. anna@bastion.example.org" },
  { key: "localPath", label: "Lokale Datei oder Ordner" },
  { key: "remotePath", label: "Pfad auf dem Server" },
  { key: "localPort", label: "Lokaler Port", type: "number" },
  { key: "remoteHost", label: "Ziel hinter dem Server" },
  { key: "remotePort", label: "Ziel-Port", type: "number" },
];

export function CommandBuilder() {
  const [input, setInput] = useState<CommandInput>(DEFAULT_COMMAND_INPUT);
  const [recipe, setRecipe] = useState(RECIPES[0]!.id);
  const current = RECIPES.find((r) => r.id === recipe)!;

  function update(key: keyof CommandInput, value: string, numeric: boolean) {
    setInput((prev) => ({ ...prev, [key]: numeric ? Math.min(65535, Math.max(0, Number(value) || 0)) : value.trim() }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <fieldset className="space-y-3 rounded-xl border border-border bg-card p-5">
        <legend className="px-1 text-sm font-semibold">Deine Angaben</legend>
        {FIELDS.map((f) => (
          <Labeled key={f.key} label={f.label} hint={f.hint} htmlFor={`cb-${f.key}`}>
            <input
              id={`cb-${f.key}`}
              className={inputClass}
              type={f.type ?? "text"}
              inputMode={f.type === "number" ? "numeric" : undefined}
              defaultValue={String(input[f.key])}
              onChange={(e) => update(f.key, e.target.value, f.type === "number")}
            />
          </Labeled>
        ))}
      </fieldset>

      <div className="min-w-0 space-y-6">
        <div role="tablist" aria-label="Befehl wählen" className="flex flex-wrap gap-2">
          {RECIPES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === recipe}
              onClick={() => setRecipe(r.id)}
              className={`rounded-full border px-3 py-1 text-sm ${
                r.id === recipe ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-border/40"
              }`}
            >
              {r.title}
            </button>
          ))}
        </div>
        <section role="tabpanel" className="space-y-2">
          <h2 className="font-semibold">{current.title}</h2>
          <p className="text-sm text-muted">{current.description}</p>
          <CodeBlock className="whitespace-pre-wrap break-all">{current.build(input)}</CodeBlock>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">Eintrag für ~/.ssh/config</h2>
          <p className="text-sm text-muted">
            Danach reicht <code className="font-mono">ssh {input.alias || "meinserver"}</code>.
          </p>
          <CodeBlock>{buildConfigEntry(input)}</CodeBlock>
        </section>
      </div>
    </div>
  );
}
