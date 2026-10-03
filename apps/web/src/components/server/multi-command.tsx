"use client";
import { useState, useTransition } from "react";
import { runCommandAction, type CommandResult } from "@/app/dashboard/befehle/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

type ServerOption = { id: string; name: string; host: string; group: string; ready: boolean; reason?: string; loginUser: string };

const EXAMPLES = ["uptime", "df -h /", "cat /etc/os-release | head -2", "apt list --upgradable 2>/dev/null | tail -n +2 | wc -l", "who"];

export function MultiCommand({ servers }: { servers: ServerOption[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [command, setCommand] = useState("");
  const [asRoot, setAsRoot] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");
  const [results, setResults] = useState<CommandResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = servers.filter((s) => s.ready);
  const groups = [...new Set(servers.map((s) => s.group))];
  const needsSudoPassword = asRoot && servers.some((s) => selected.has(s.id) && s.loginUser !== "root");

  const toggle = (id: string, on: boolean) => setSelected((cur) => new Set(on ? [...cur, id] : [...cur].filter((x) => x !== id)));

  const run = () => {
    if (!window.confirm(`„${command.trim()}“ auf ${selected.size} Server${selected.size === 1 ? "" : "n"} ausführen${asRoot ? " (als root)" : ""}?`)) return;
    setError(null);
    start(async () => {
      const r = await runCommandAction({ serverIds: [...selected], command, asRoot, sudoPassword: needsSudoPassword ? sudoPassword : undefined });
      if (r.ok) setResults(r.results);
      else setError(r.error);
    });
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Server ({selected.size} gewählt)</h2>
          <div className="flex gap-2 text-sm">
            <button type="button" className="text-primary hover:underline" onClick={() => setSelected(new Set(ready.map((s) => s.id)))}>
              Alle
            </button>
            <button type="button" className="text-primary hover:underline" onClick={() => setSelected(new Set())}>
              Keine
            </button>
          </div>
        </div>
        {groups.map((g) => (
          <fieldset key={g} className="space-y-1">
            <legend className="mb-1 text-xs font-medium text-muted">{g}</legend>
            <ul className="grid gap-1 sm:grid-cols-2">
              {servers
                .filter((s) => s.group === g)
                .map((s) => (
                  <li key={s.id}>
                    <label className={`flex items-center gap-2 text-sm ${s.ready ? "" : "opacity-60"}`}>
                      <input type="checkbox" disabled={!s.ready} checked={selected.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                      <span className="font-medium">{s.name}</span>
                      <span className="truncate font-mono text-xs text-muted">{s.ready ? `${s.loginUser}@${s.host}` : s.reason}</span>
                    </label>
                  </li>
                ))}
            </ul>
          </fieldset>
        ))}
      </Card>

      <Card className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="mc-command" className="block text-sm font-medium">
            Befehl
          </label>
          <textarea
            id="mc-command"
            rows={3}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
            placeholder="uptime"
          />
          <div className="flex flex-wrap gap-2 text-xs">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="rounded border border-border px-2 py-0.5 font-mono hover:bg-border/40" onClick={() => setCommand(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={asRoot} onChange={(e) => setAsRoot(e.target.checked)} />
          Als root ausführen (sudo)
        </label>
        {needsSudoPassword && (
          <div className="max-w-sm">
            <Field
              id="mc-sudo"
              type="password"
              label="sudo-Passwort (optional)"
              hint="Leer lassen, wenn sudo ohne Passwort eingerichtet ist. Das Passwort gilt für alle gewählten Server und wird nicht gespeichert."
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="button" onClick={run} disabled={pending || !selected.size || !command.trim()}>
          {pending ? "Läuft …" : "Ausführen"}
        </Button>
      </Card>

      {results && (
        <div className="space-y-3">
          <h2 className="font-semibold">
            Ergebnis: {results.filter((r) => r.ok).length} von {results.length} erfolgreich
          </h2>
          {results.map((r) => (
            <Card key={r.serverId} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.name}</span>
                {r.ok ? <Badge tone="good">Exit 0</Badge> : <Badge tone="bad">{r.exitCode !== null ? `Exit ${r.exitCode}` : "Fehler"}</Badge>}
              </div>
              {r.error && <p className="text-sm text-danger">{r.error}</p>}
              {r.stdout && <pre className="max-h-80 overflow-auto rounded-lg bg-terminal p-3 font-mono text-xs text-slate-200">{r.stdout}</pre>}
              {r.stderr && <pre className="max-h-60 overflow-auto rounded-lg bg-terminal p-3 font-mono text-xs text-amber-300">{r.stderr}</pre>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
