"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SFTP_MAX_TRANSFER_BYTES, type ClientControl, type ServerControl, type SftpEntry } from "@ssh-academy/ssh/protocol";
import { createConnection } from "@/app/dashboard/server/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";
import { formatBytes } from "@/lib/format";
import type { ConnectOption } from "./terminal-view";

type SftpOp = ClientControl extends infer C ? (C extends { type: "sftp" } ? Omit<C, "id" | "type"> : never) : never;
type OkResult = Extract<ServerControl, { type: "sftp-result"; ok: true }>;
type State = "idle" | "connecting" | "password" | "connected" | "closed";

const join = (dir: string, name: string) => (dir.endsWith("/") ? dir + name : `${dir}/${name}`);
const parentOf = (p: string) => (p === "/" ? "/" : p.replace(/\/[^/]+\/?$/, "") || "/");

function modeString(mode: number, type: SftpEntry["type"]) {
  const r = (b: number) => `${b & 4 ? "r" : "-"}${b & 2 ? "w" : "-"}${b & 1 ? "x" : "-"}`;
  return `${type === "dir" ? "d" : type === "link" ? "l" : "-"}${r(mode >> 6)}${r((mode >> 3) & 7)}${r(mode & 7)}`;
}

/** Verbindung zum Gateway mit Anfrage/Antwort-Zuordnung über ids */
class SftpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: OkResult) => void; reject: (e: Error) => void }>();
  private download: { id: number; chunks: Uint8Array[]; resolve: (b: Blob) => void; reject: (e: Error) => void; onProgress: (n: number) => void; received: number } | null = null;
  home = "/";
  onHome: (home: string) => void = () => {};

  constructor(private ws: WebSocket) {}

  handle(data: string | ArrayBuffer) {
    if (typeof data !== "string") {
      if (this.download) {
        const chunk = new Uint8Array(data);
        this.download.chunks.push(chunk);
        this.download.received += chunk.length;
        this.download.onProgress(this.download.received);
      }
      return;
    }
    const msg = JSON.parse(data) as ServerControl;
    if (msg.type === "sftp-data-end" && this.download?.id === msg.id) {
      this.download.resolve(new Blob(this.download.chunks as BlobPart[]));
      this.download = null;
      return;
    }
    if (msg.type !== "sftp-result") return;
    if (msg.id === 0 && msg.ok && msg.home) {
      this.home = msg.home;
      this.onHome(msg.home);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) {
      if (!msg.ok && this.download?.id === msg.id) {
        this.download.reject(new Error(msg.message));
        this.download = null;
      }
      return;
    }
    this.pending.delete(msg.id);
    if (msg.ok) p.resolve(msg);
    else p.reject(new Error(msg.message));
  }

  failAll(reason: string) {
    for (const p of this.pending.values()) p.reject(new Error(reason));
    this.pending.clear();
    this.download?.reject(new Error(reason));
    this.download = null;
  }

  request(op: SftpOp) {
    const id = this.nextId++;
    return {
      id,
      result: new Promise<OkResult>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.ws.send(JSON.stringify({ type: "sftp", id, ...op }));
      }),
    };
  }

  async list(path: string) {
    return (await this.request({ op: "list", path }).result).entries ?? [];
  }

  async fetchFile(path: string, onProgress: (n: number, total: number) => void) {
    const { id, result } = this.request({ op: "download", path });
    const blob = new Promise<Blob>((resolve, reject) => {
      this.download = { id, chunks: [], resolve, reject, onProgress: () => {}, received: 0 };
    });
    const { size = 0 } = await result;
    if (this.download?.id === id) this.download.onProgress = (n) => onProgress(n, size);
    return blob;
  }

  async upload(path: string, file: File, onProgress: (n: number) => void) {
    await this.request({ op: "upload-start", path, size: file.size }).result;
    const CHUNK = 64 * 1024;
    for (let offset = 0; offset < file.size; offset += CHUNK) {
      while (this.ws.bufferedAmount > 2 * 1024 * 1024) await new Promise((r) => setTimeout(r, 20));
      this.ws.send(await file.slice(offset, offset + CHUNK).arrayBuffer());
      onProgress(Math.min(file.size, offset + CHUNK));
    }
    await this.request({ op: "upload-end" }).result;
  }
}

export function SftpBrowser({ serverId, options, passwordUsers }: { serverId: string; options: ConnectOption[]; passwordUsers: string[] | "any" }) {
  const wsRef = useRef<WebSocket | null>(null);
  const clientRef = useRef<SftpClient | null>(null);
  const [state, setState] = useState<State>("idle");
  const [choice, setChoice] = useState(options[0]?.value ?? "password");
  const [passwordUser, setPasswordUser] = useState(passwordUsers === "any" ? "root" : (passwordUsers[0] ?? ""));
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState<{ tone: "info" | "warning" | "error"; text: string } | null>(null);
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => wsRef.current?.close(), []);

  const open = async (target: string) => {
    const client = clientRef.current;
    if (!client) return;
    setLoading(true);
    try {
      setEntries(await client.list(target));
      setPath(target);
      setMessage(null);
    } catch (e) {
      setMessage({ tone: "error", text: `${target}: ${(e as Error).message}` });
    }
    setLoading(false);
  };

  async function connect() {
    const option = options.find((o) => o.value === choice);
    setMessage(null);
    setState("connecting");
    const res = await createConnection({ serverId, kind: "sftp", linuxUser: option?.linuxUser ?? passwordUser, keyId: option?.keyId });
    if (!res.ok) {
      setState("idle");
      return setMessage({ tone: "error", text: res.error });
    }
    const url = new URL(res.url);
    url.searchParams.set("token", res.token);
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    const client = new SftpClient(ws);
    clientRef.current = client;
    let connected = false;
    let home: string | null = null;
    const maybeStart = () => {
      if (connected && home !== null) void open(home);
    };
    client.onHome = (h) => {
      home = h;
      maybeStart();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        const msg = JSON.parse(ev.data) as ServerControl;
        if (msg.type === "need-password") {
          setPrompt(msg.prompt);
          setState("password");
          return;
        }
        if (msg.type === "status" && msg.state === "connected") {
          connected = true;
          setState("connected");
          maybeStart();
          return;
        }
        if (msg.type === "error") return setMessage({ tone: "error", text: msg.message });
        if (msg.type === "exit") return setMessage({ tone: "warning", text: msg.reason });
      }
      client.handle(ev.data as string | ArrayBuffer);
    };
    ws.onclose = () => {
      setState("closed");
      client.failAll("Verbindung getrennt");
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

  const act = async (fn: () => Promise<unknown>, after?: string) => {
    try {
      await fn();
      if (after) setMessage({ tone: "info", text: after });
      await open(path);
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    }
  };

  const download = async (entry: SftpEntry) => {
    const client = clientRef.current!;
    try {
      setProgress(`${entry.name}: 0 %`);
      const blob = await client.fetchFile(join(path, entry.name), (n, total) => setProgress(`${entry.name}: ${total ? Math.round((n / total) * 100) : 100} %`));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    }
    setProgress(null);
  };

  const upload = async (files: FileList | null) => {
    const client = clientRef.current;
    if (!client || !files?.length) return;
    for (const file of Array.from(files)) {
      if (file.size > SFTP_MAX_TRANSFER_BYTES) {
        setMessage({ tone: "error", text: `${file.name} ist größer als 100 MB.` });
        continue;
      }
      if (entries.some((e) => e.name === file.name) && !window.confirm(`${file.name} gibt es schon. Überschreiben?`)) continue;
      try {
        await client.upload(join(path, file.name), file, (n) => setProgress(`${file.name}: ${Math.round((n / Math.max(1, file.size)) * 100)} %`));
        setMessage({ tone: "info", text: `${file.name} hochgeladen.` });
      } catch (e) {
        setMessage({ tone: "error", text: `${file.name}: ${(e as Error).message}` });
      }
    }
    setProgress(null);
    if (uploadRef.current) uploadRef.current.value = "";
    await open(path);
  };

  const busy = state === "connecting" || state === "password" || state === "connected";
  const visible = entries.filter((e) => e.name !== "." && e.name !== ".." && (showHidden || !e.name.startsWith(".")));
  const crumbs = path.split("/").filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <SelectField id="sftp-auth" label="Anmelden mit" value={choice} disabled={busy} onChange={(e) => setChoice(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="password">Passwort (wird nicht gespeichert)</option>
          </SelectField>
        </div>
        {choice === "password" && (
          <div className="w-40">
            {passwordUsers === "any" ? (
              <Field id="sftp-user" label="Benutzer" value={passwordUser} disabled={busy} onChange={(e) => setPasswordUser(e.target.value.trim())} />
            ) : (
              <SelectField id="sftp-user" label="Benutzer" value={passwordUser} disabled={busy} onChange={(e) => setPasswordUser(e.target.value)}>
                {passwordUsers.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </SelectField>
            )}
          </div>
        )}
        {state === "connected" ? (
          <Button type="button" variant="secondary" onClick={() => wsRef.current?.close()}>
            Trennen
          </Button>
        ) : (
          <Button type="button" onClick={() => void connect()} disabled={busy}>
            {state === "connecting" ? "Verbinde …" : state === "closed" ? "Neu verbinden" : "Verbinden"}
          </Button>
        )}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {state === "password" && (
        <form onSubmit={sendPassword} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div className="min-w-64 flex-1">
            <Field id="sftp-pw" name="password" type="password" label={prompt} autoFocus autoComplete="off" required />
          </div>
          <Button type="submit">Anmelden</Button>
        </form>
      )}

      {state === "connected" && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <nav aria-label="Pfad" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 font-mono">
              <button type="button" className="text-primary hover:underline" onClick={() => void open("/")}>
                /
              </button>
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  <button type="button" className="text-primary hover:underline" onClick={() => void open("/" + crumbs.slice(0, i + 1).join("/"))}>
                    {c}
                  </button>
                  {i < crumbs.length - 1 && <span className="text-muted">/</span>}
                </span>
              ))}
            </nav>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Versteckte Dateien
            </label>
            <Button type="button" variant="ghost" onClick={() => void open(clientRef.current?.home ?? "/")}>
              Home
            </Button>
            <Button type="button" variant="ghost" onClick={() => void open(path)}>
              Neu laden
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const name = window.prompt("Name des neuen Ordners");
                if (name && !name.includes("/")) void act(() => clientRef.current!.request({ op: "mkdir", path: join(path, name) }).result);
              }}
            >
              Neuer Ordner
            </Button>
            <Button type="button" onClick={() => uploadRef.current?.click()} disabled={Boolean(progress)}>
              Hochladen
            </Button>
            <input ref={uploadRef} type="file" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
          </div>
          {progress && <p className="text-sm text-muted">Übertrage {progress}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Größe</th>
                  <th className="py-2 pr-3 font-medium">Rechte</th>
                  <th className="py-2 pr-3 font-medium">Geändert</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className={loading ? "opacity-50" : ""}>
                {path !== "/" && (
                  <tr className="border-t border-border">
                    <td className="py-2" colSpan={5}>
                      <button type="button" className="text-primary hover:underline" onClick={() => void open(parentOf(path))}>
                        .. (eine Ebene höher)
                      </button>
                    </td>
                  </tr>
                )}
                {visible.map((e) => (
                  <tr key={e.name} className="border-t border-border">
                    <td className="py-2 pr-3">
                      {e.type === "dir" ? (
                        <button type="button" className="font-medium text-primary hover:underline" onClick={() => void open(join(path, e.name))}>
                          {e.name}/
                        </button>
                      ) : (
                        <span>{e.name}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted">{e.type === "dir" ? "" : formatBytes(e.size)}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted">{modeString(e.mode, e.type)}</td>
                    <td className="py-2 pr-3 text-muted">{new Date(e.mtime * 1000).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="space-x-2 py-2 text-right whitespace-nowrap">
                      {e.type === "file" && (
                        <button type="button" className="text-primary hover:underline" onClick={() => void download(e)} disabled={Boolean(progress)}>
                          Laden
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => {
                          const name = window.prompt("Neuer Name", e.name);
                          if (name && name !== e.name && !name.includes("/"))
                            void act(() => clientRef.current!.request({ op: "rename", from: join(path, e.name), to: join(path, name) }).result);
                        }}
                      >
                        Umbenennen
                      </button>
                      <button
                        type="button"
                        className="text-danger hover:underline"
                        onClick={() => {
                          if (window.confirm(`${e.name} wirklich löschen?${e.type === "dir" ? " (nur leere Ordner)" : ""}`))
                            void act(() => clientRef.current!.request({ op: "delete", path: join(path, e.name), directory: e.type === "dir" }).result);
                        }}
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr className="border-t border-border">
                    <td className="py-3 text-muted" colSpan={5}>
                      Leerer Ordner
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Dateien bis 100 MB. Jede Übertragung und jede Änderung steht im Protokoll.</p>
        </div>
      )}
    </div>
  );
}
