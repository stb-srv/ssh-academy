"use client";
import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ServerControl } from "@ssh-academy/ssh/protocol";
import { createConnection } from "@/app/dashboard/server/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";

export type ConnectOption = { value: string; label: string; linuxUser: string; keyId?: string };

type State = "idle" | "connecting" | "password" | "connected" | "closed";

export function TerminalView({ serverId, options, passwordUsers }: { serverId: string; options: ConnectOption[]; passwordUsers: string[] | "any" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<State>("idle");
  const [choice, setChoice] = useState(options[0]?.value ?? "password");
  const [passwordUser, setPasswordUser] = useState(passwordUsers === "any" ? "root" : (passwordUsers[0] ?? ""));
  const [message, setMessage] = useState<{ tone: "info" | "warning" | "error"; text: string } | null>(null);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !containerRef.current) return;
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 14,
        theme: { background: "#050a14" },
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      term.writeln("\x1b[32mSSH-Academy Web-Terminal\x1b[0m: wähle oben die Anmeldung und klicke auf Verbinden.");
      term.onData((data) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(data));
      });
      termRef.current = term;
      fitRef.current = fit;
    })();
    const onResize = () => {
      fitRef.current?.fit();
      const term = termRef.current;
      const ws = wsRef.current;
      if (term && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  }, []);

  async function connect() {
    const term = termRef.current;
    if (!term) return;
    const option = options.find((o) => o.value === choice);
    const linuxUser = option?.linuxUser ?? passwordUser;
    setMessage(null);
    setState("connecting");
    const res = await createConnection({ serverId, kind: "terminal", linuxUser, keyId: option?.keyId });
    if (!res.ok) {
      setState("idle");
      return setMessage({ tone: "error", text: res.error });
    }
    if (res.recorded) setMessage({ tone: "warning", text: "Hinweis: Diese Sitzung wird aufgezeichnet (Team-Einstellung)." });
    term.reset();
    const url = new URL(res.url);
    url.searchParams.set("token", res.token);
    url.searchParams.set("cols", String(term.cols));
    url.searchParams.set("rows", String(term.rows));
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return term.write(new Uint8Array(ev.data as ArrayBuffer));
      const msg = JSON.parse(ev.data) as ServerControl;
      if (msg.type === "need-password") {
        setPrompt(msg.prompt);
        setState("password");
      } else if (msg.type === "status" && msg.state === "connected") {
        setState("connected");
        term.focus();
      } else if (msg.type === "error") {
        setMessage({ tone: "error", text: msg.message });
      } else if (msg.type === "exit") {
        term.writeln(`\r\n\x1b[33m${msg.reason}\x1b[0m`);
      } else if (msg.type === "notice") {
        setMessage({ tone: "warning", text: msg.message });
      }
    };
    ws.onclose = () => {
      setState("closed");
      term.writeln("\r\n\x1b[90m[Verbindung getrennt]\x1b[0m");
    };
    ws.onerror = () => setMessage({ tone: "error", text: "Das Gateway ist nicht erreichbar." });
  }

  function sendPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pw = String(new FormData(e.currentTarget).get("password") ?? "");
    wsRef.current?.send(JSON.stringify({ type: "auth", password: pw }));
    e.currentTarget.reset();
    setState("connecting");
  }

  const busy = state === "connecting" || state === "password" || state === "connected";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <SelectField id="term-auth" label="Anmelden mit" value={choice} disabled={busy} onChange={(e) => setChoice(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="password">Passwort (wird nicht gespeichert)</option>
          </SelectField>
        </div>
        {choice === "password" &&
          (passwordUsers === "any" ? (
            <div className="w-40">
              <Field id="term-user" label="Benutzer" value={passwordUser} disabled={busy} onChange={(e) => setPasswordUser(e.target.value.trim())} />
            </div>
          ) : (
            <div className="w-40">
              <SelectField id="term-user" label="Benutzer" value={passwordUser} disabled={busy} onChange={(e) => setPasswordUser(e.target.value)}>
                {passwordUsers.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </SelectField>
            </div>
          ))}
        {state === "connected" ? (
          <Button type="button" variant="secondary" onClick={() => wsRef.current?.close()}>
            Trennen
          </Button>
        ) : (
          <Button type="button" onClick={() => void connect()} disabled={busy}>
            {state === "connecting" ? "Verbinde …" : state === "closed" ? "Neu verbinden" : "Verbinden"}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => window.open(window.location.href, "_blank", "noopener")}>
          Weiterer Tab
        </Button>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {state === "password" && (
        <form onSubmit={sendPassword} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div className="min-w-64 flex-1">
            <Field id="term-pw" name="password" type="password" label={prompt} autoFocus autoComplete="off" required />
          </div>
          <Button type="submit">Anmelden</Button>
        </form>
      )}
      <div ref={containerRef} className="h-[65vh] min-h-80 overflow-hidden rounded-xl bg-[#050a14] p-2" />
      <p className="text-xs text-muted">Die Sitzung endet nach längerer Inaktivität automatisch. Kopieren mit Markieren, Einfügen mit Strg+Umschalt+V.</p>
    </div>
  );
}
