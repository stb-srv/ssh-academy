"use client";
import { useState } from "react";
import { CodeBlock } from "@/components/lernen/code-block";
import { Alert } from "@/components/ui/alert";
import { checkPermissions, RECHTE_COMMAND } from "@/lib/tools/rechte";
import { inputClass } from "./inputs";

export function PermissionChecker() {
  const [text, setText] = useState("");
  const findings = checkPermissions(text);
  const fixes = findings.flatMap((f) => (f.fix ? [f.fix] : []));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm">1. Führe diesen Befehl auf dem Rechner oder Server aus, den du prüfen willst:</p>
        <CodeBlock>{RECHTE_COMMAND}</CodeBlock>
      </div>
      <div className="space-y-2">
        <label htmlFor="pc-input" className="block text-sm">
          2. Füge die Ausgabe hier ein:
        </label>
        <textarea
          id="pc-input"
          rows={7}
          className={`${inputClass} font-mono`}
          placeholder={"drwx------ 2 anna anna 4096 Mar  3 10:00 /home/anna/.ssh\n-rw------- 1 anna anna  411 Mar  3 10:00 /home/anna/.ssh/id_ed25519"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {text.trim() && findings.length === 0 && (
        <Alert tone="warning">Ich konnte keine Zeilen von ls -l erkennen. Bitte die komplette Ausgabe einfügen.</Alert>
      )}
      {findings.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Pfad</th>
                <th className="px-4 py-2 font-medium">Rechte</th>
                <th className="px-4 py-2 font-medium">Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.path} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{f.path}</td>
                  <td className="px-4 py-2 font-mono text-xs">{f.mode}</td>
                  <td className={`px-4 py-2 ${f.ok ? "" : "text-danger"}`}>
                    <span aria-hidden>{f.ok ? "✓ " : "✗ "}</span>
                    {f.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {findings.length > 0 &&
        (fixes.length ? (
          <section className="space-y-2">
            <h2 className="font-semibold">So reparierst du es</h2>
            <CodeBlock>{fixes.join("\n")}</CodeBlock>
            <p className="text-xs text-muted">Gehört eine Datei einem anderen Benutzer, vorher mit sudo chown korrigieren.</p>
          </section>
        ) : (
          <Alert>Alles in Ordnung, die Rechte passen.</Alert>
        ))}
      {findings.some((f) => f.owner === "root" && /\.ssh/.test(f.path) && !/^\/root/.test(f.path)) && (
        <Alert tone="warning">
          Mindestens eine Datei gehört root, liegt aber im Home eines anderen Benutzers. Dann kann sich dieser Benutzer nicht mit
          dem Key anmelden. Lösung: <code className="font-mono">sudo chown -R benutzer:benutzer ~benutzer/.ssh</code>
        </Alert>
      )}
    </div>
  );
}
