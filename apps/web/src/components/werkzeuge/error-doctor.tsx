"use client";
import Link from "next/link";
import { useState } from "react";
import { CodeBlock } from "@/components/lernen/code-block";
import { Alert } from "@/components/ui/alert";
import { DIAGNOSES, diagnose, type Diagnosis } from "@/lib/tools/fehler";
import { inputClass } from "./inputs";

function DiagnosisCard({ d }: { d: Diagnosis }) {
  return (
    <article className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{d.title}</h2>
      <p className="text-sm">{d.cause}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {d.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {d.commands && <CodeBlock className="whitespace-pre-wrap break-all">{d.commands.join("\n")}</CodeBlock>}
      {d.lesson && (
        <Link href={d.lesson} className="text-sm text-primary hover:underline">
          Passende Lektion lesen
        </Link>
      )}
    </article>
  );
}

export function ErrorDoctor() {
  const [text, setText] = useState("");
  const results = diagnose(text);

  return (
    <div className="space-y-6">
      <label htmlFor="ed-input" className="block text-sm font-medium">
        Fehlermeldung
      </label>
      <textarea
        id="ed-input"
        rows={6}
        className={`${inputClass} font-mono`}
        placeholder="z. B. anna@203.0.113.7: Permission denied (publickey)."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-xs text-muted">
        Tipp: <code className="font-mono">ssh -v benutzer@server</code> zeigt ausführliche Meldungen. Die Analyse passiert nur in
        deinem Browser.
      </p>

      {text.trim() && results.length === 0 && (
        <Alert tone="warning">
          Diese Meldung kenne ich noch nicht. Schau in die Liste unten oder in die Lektion{" "}
          <Link href="/lernen/fortgeschritten/fehlersuche" className="underline">
            Fehlersuche
          </Link>
          .
        </Alert>
      )}
      {results.map((d) => (
        <DiagnosisCard key={d.id} d={d} />
      ))}

      <details className="rounded-xl border border-border bg-card p-5">
        <summary className="cursor-pointer font-semibold">Alle bekannten Fehler ({DIAGNOSES.length})</summary>
        <div className="mt-4 space-y-4">
          {DIAGNOSES.map((d) => (
            <DiagnosisCard key={d.id} d={d} />
          ))}
        </div>
      </details>
    </div>
  );
}
