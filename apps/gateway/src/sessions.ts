/**
 * Browser-Verbindungen über WebSocket: Web-Terminal und SFTP.
 * Ablauf: Die Web-App legt eine connection_session mit Einmal-Token an (60 Sekunden gültig),
 * der Browser verbindet sich mit diesem Token, das Gateway löst es genau einmal ein.
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { Client, ClientChannel, SFTPWrapper } from "ssh2";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { and, eq, gt, inArray, schema, sql } from "@ssh-academy/db";
import {
  SFTP_MAX_TRANSFER_BYTES,
  type ClientControl,
  type Credentials,
  type ServerControl,
  type SftpEntry,
} from "@ssh-academy/ssh/protocol";
import { audit } from "./audit";
import { config } from "./config";
import { db } from "./db";
import { connect, GatewayError } from "./ssh";

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
const activeByUser = new Map<string, number>();
let activeTotal = 0;
/** Laufende Verbindungen: sessionId -> Nutzer und Abbruch-Funktion */
const live = new Map<string, { userId: string | null; kill: (reason: string) => void }>();

/**
 * Prüft regelmäßig, ob laufende Verbindungen beendet werden müssen: Nutzer gesperrt (z. B. durch den
 * Pocket-ID-Abgleich) oder die Sitzung wurde in der Web-App beendet (Status nicht mehr "active").
 */
async function sweepLiveSessions() {
  if (!live.size) return;
  const ids = [...live.keys()];
  const rows = await db
    .select({ id: schema.connectionSession.id, status: schema.connectionSession.status, banned: schema.user.banned })
    .from(schema.connectionSession)
    .leftJoin(schema.user, eq(schema.user.id, schema.connectionSession.userId))
    .where(inArray(schema.connectionSession.id, ids));
  for (const r of rows) {
    const entry = live.get(r.id);
    if (!entry) continue;
    if (r.banned) entry.kill("Nutzer wurde gesperrt");
    else if (r.status !== "active") entry.kill("In der Web-App beendet");
  }
}
setInterval(() => void sweepLiveSessions().catch((err) => console.error("[ws] Prüfung fehlgeschlagen", err)), 30_000).unref();

export function activeSessionCount() {
  return activeTotal;
}

export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const url = new URL(req.url ?? "/", "http://gateway");
  if (url.pathname !== "/gateway/ws" && url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  // Nur die eigene Web-App darf Verbindungen öffnen (Schutz gegen fremde Seiten)
  if (config.appOrigin && req.headers.origin !== config.appOrigin) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  const token = url.searchParams.get("token") ?? "";
  const cols = clamp(Number(url.searchParams.get("cols")) || 80, 20, 500);
  const rows = clamp(Number(url.searchParams.get("rows")) || 24, 5, 200);
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? null;
  wss.handleUpgrade(req, socket, head, (ws) => {
    void startSession(ws, token, { cols, rows, ip }).catch((err) => {
      console.error("[ws] Sitzung fehlgeschlagen", err);
      ws.close(1011);
    });
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function sendControl(ws: WebSocket, msg: ServerControl) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function waitForPassword(ws: WebSocket, timeoutMs = 120_000) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new GatewayError("TIMEOUT", "Kein Passwort eingegeben."));
    }, timeoutMs);
    const onMessage = (data: RawData, isBinary: boolean) => {
      if (isBinary) return;
      try {
        const msg = JSON.parse(data.toString()) as ClientControl;
        if (msg.type === "auth" && typeof msg.password === "string") {
          clearTimeout(timer);
          ws.off("message", onMessage);
          resolve(msg.password);
        }
      } catch {
        /* ignorieren */
      }
    };
    ws.on("message", onMessage);
    ws.once("close", () => {
      clearTimeout(timer);
      reject(new GatewayError("BAD_REQUEST", "Verbindung geschlossen."));
    });
  });
}

async function startSession(ws: WebSocket, token: string, opts: { cols: number; rows: number; ip: string | null }) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  // Token genau einmal einlösen (atomar)
  const [session] = await db
    .update(schema.connectionSession)
    .set({ status: "active", startedAt: new Date(), tokenHash: null, clientIp: opts.ip && /^[0-9a-fA-F:.]+$/.test(opts.ip) ? opts.ip : null })
    .where(
      and(
        eq(schema.connectionSession.tokenHash, tokenHash),
        eq(schema.connectionSession.status, "pending"),
        gt(schema.connectionSession.tokenExpiresAt, new Date()),
      ),
    )
    .returning();
  if (!session) {
    sendControl(ws, { type: "error", code: "BAD_REQUEST", message: "Der Verbindungslink ist ungültig oder abgelaufen. Bitte neu verbinden." });
    ws.close(4001);
    return;
  }

  const userId = session.userId ?? "unbekannt";
  const count = activeByUser.get(userId) ?? 0;
  if (count >= config.maxConcurrentSessionsPerUser) {
    await finish(session.id, "failed", "Zu viele gleichzeitige Verbindungen");
    sendControl(ws, { type: "error", code: "BAD_REQUEST", message: `Höchstens ${config.maxConcurrentSessionsPerUser} gleichzeitige Verbindungen.` });
    ws.close(4002);
    return;
  }
  activeByUser.set(userId, count + 1);
  activeTotal++;

  let client: Client | null = null;
  let closed = false;
  const stats = { bytesIn: 0, bytesOut: 0 };
  const recorder = session.record && session.kind === "terminal" ? createRecorder(opts.cols, opts.rows) : null;
  const timers: NodeJS.Timeout[] = [];

  const cleanup = async (reason: string, status: "closed" | "failed" = "closed") => {
    if (closed) return;
    closed = true;
    live.delete(session.id);
    timers.forEach(clearTimeout);
    client?.end();
    activeByUser.set(userId, Math.max(0, (activeByUser.get(userId) ?? 1) - 1));
    activeTotal = Math.max(0, activeTotal - 1);
    await finish(session.id, status, reason, stats);
    if (recorder) await recorder.save(session.id);
    await audit({
      action: `${session.kind}.closed`,
      actorId: session.userId,
      organizationId: session.organizationId,
      targetType: "server",
      targetId: session.serverId ?? undefined,
      ip: opts.ip,
      metadata: { sessionId: session.id, linuxUser: session.linuxUser, reason, ...stats },
    });
    if (ws.readyState === ws.OPEN) ws.close(1000);
  };
  ws.once("close", () => void cleanup("Browser hat die Verbindung geschlossen"));
  live.set(session.id, {
    userId: session.userId,
    kill: (reason) => {
      sendControl(ws, { type: "exit", code: null, reason: `Verbindung beendet: ${reason}.` });
      void cleanup(reason);
    },
  });

  try {
    const [server] = session.serverId ? await db.select().from(schema.server).where(eq(schema.server.id, session.serverId)) : [];
    if (!server) throw new GatewayError("BAD_REQUEST", "Server nicht gefunden.");
    if (!server.hostKeyConfirmedAt || !server.hostKeyFingerprint) throw new GatewayError("HOST_KEY_UNCONFIRMED");

    let credentials: Credentials;
    if (session.authMethod === "password") {
      sendControl(ws, { type: "need-password", prompt: `Passwort für ${session.linuxUser}@${server.host}` });
      credentials = { method: "password", username: session.linuxUser, password: await waitForPassword(ws) };
    } else {
      if (!session.keyId) throw new GatewayError("KEY_UNAVAILABLE");
      credentials = { method: "key", username: session.linuxUser, keyId: session.keyId };
    }

    sendControl(ws, { type: "status", state: "connecting" });
    client = await connect({
      target: { host: server.host, port: server.port, hostKeyFingerprint: server.hostKeyFingerprint },
      credentials,
      keepalive: true,
    });
    if (closed) return client.end();
    client.on("close", () => void cleanup("Server hat die Verbindung beendet"));
    client.on("error", () => void cleanup("Verbindungsfehler", "failed"));

    await audit({
      action: `${session.kind}.opened`,
      actorId: session.userId,
      organizationId: session.organizationId,
      targetType: "server",
      targetId: server.id,
      ip: opts.ip,
      metadata: { sessionId: session.id, linuxUser: session.linuxUser, authMethod: session.authMethod, recorded: Boolean(recorder) },
    });

    // Zeitlimits: Leerlauf und Höchstdauer
    let idleTimer: NodeJS.Timeout;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        sendControl(ws, { type: "exit", code: null, reason: `Nach ${session.idleTimeoutMinutes} Minuten ohne Eingabe getrennt.` });
        void cleanup("Leerlauf");
      }, session.idleTimeoutMinutes * 60_000);
      timers[0] = idleTimer;
    };
    resetIdle();
    timers.push(
      setTimeout(() => {
        sendControl(ws, { type: "exit", code: null, reason: "Höchstdauer der Sitzung erreicht." });
        void cleanup("Höchstdauer");
      }, session.maxDurationMinutes * 60_000),
    );

    if (session.kind === "terminal") {
      if (recorder) sendControl(ws, { type: "notice", message: "Diese Sitzung wird aufgezeichnet (Team-Einstellung)." });
      await runTerminal(ws, client, opts, stats, recorder, resetIdle, (code) => {
        sendControl(ws, { type: "exit", code, reason: "Sitzung beendet." });
        void cleanup("Shell beendet");
      });
    } else {
      await runSftp(ws, client, stats, resetIdle, session, opts.ip);
    }
    sendControl(ws, { type: "status", state: "connected" });
  } catch (err) {
    const e = err instanceof GatewayError ? err : new GatewayError("INTERNAL", (err as Error).message);
    sendControl(ws, { type: "error", code: e.code, message: e.message });
    if (e.code === "HOST_KEY_MISMATCH" && session.serverId) {
      await db.update(schema.server).set({ status: "host_key_mismatch", lastError: e.message }).where(eq(schema.server.id, session.serverId));
      await audit({ action: "server.host_key_mismatch", actorId: session.userId, organizationId: session.organizationId, targetType: "server", targetId: session.serverId });
    }
    await cleanup(e.message, "failed");
  }
}

async function finish(id: string, status: "closed" | "failed", reason: string, stats?: { bytesIn: number; bytesOut: number }) {
  await db
    .update(schema.connectionSession)
    .set({ status, endedAt: new Date(), endReason: reason.slice(0, 300), ...(stats ?? {}) })
    .where(eq(schema.connectionSession.id, id));
}

type Recorder = ReturnType<typeof createRecorder>;

/** Aufzeichnung im asciicast-v2-Format (nur Ausgabe, keine Tastatureingaben) */
function createRecorder(cols: number, rows: number) {
  const start = Date.now();
  const lines = [JSON.stringify({ version: 2, width: cols, height: rows, timestamp: Math.floor(start / 1000), env: { TERM: "xterm-256color" } })];
  let size = lines[0]!.length;
  let full = false;
  const t = () => Number(((Date.now() - start) / 1000).toFixed(3));
  return {
    output(data: string) {
      if (full) return;
      const line = JSON.stringify([t(), "o", data]);
      size += line.length;
      if (size > config.maxRecordingBytes) {
        full = true;
        lines.push(JSON.stringify([t(), "o", "\r\n[Aufzeichnung wegen Größe beendet]\r\n"]));
        return;
      }
      lines.push(line);
    },
    resize(c: number, r: number) {
      if (!full) lines.push(JSON.stringify([t(), "r", `${c}x${r}`]));
    },
    async save(sessionId: string) {
      const raw = Buffer.from(lines.join("\n") + "\n");
      await db
        .insert(schema.sessionRecording)
        .values({ sessionId, data: gzipSync(raw).toString("base64"), sizeBytes: raw.length, durationMs: Date.now() - start })
        .onConflictDoNothing();
    },
  };
}

function runTerminal(
  ws: WebSocket,
  client: Client,
  size: { cols: number; rows: number },
  stats: { bytesIn: number; bytesOut: number },
  recorder: Recorder | null,
  onActivity: () => void,
  onExit: (code: number | null) => void,
) {
  return new Promise<void>((resolve, reject) => {
    client.shell({ term: "xterm-256color", cols: size.cols, rows: size.rows }, (err, stream: ClientChannel) => {
      if (err) return reject(new GatewayError("INTERNAL", "Die Shell konnte nicht gestartet werden."));
      stream.on("data", (d: Buffer) => {
        stats.bytesOut += d.length;
        recorder?.output(d.toString("utf8"));
        if (ws.readyState === ws.OPEN) ws.send(d, { binary: true });
      });
      stream.stderr.on("data", (d: Buffer) => ws.readyState === ws.OPEN && ws.send(d, { binary: true }));
      stream.on("exit", (code: number | null) => onExit(code));
      stream.on("close", () => onExit(null));
      ws.on("message", (data: RawData, isBinary: boolean) => {
        if (isBinary) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          stats.bytesIn += buf.length;
          onActivity();
          stream.write(buf);
          return;
        }
        try {
          const msg = JSON.parse(data.toString()) as ClientControl;
          if (msg.type === "resize") {
            const cols = clamp(msg.cols, 20, 500);
            const rows = clamp(msg.rows, 5, 200);
            stream.setWindow(rows, cols, 0, 0);
            recorder?.resize(cols, rows);
          }
        } catch {
          /* ungültige Steuernachricht ignorieren */
        }
      });
      resolve();
    });
  });
}

function entryType(mode: number): SftpEntry["type"] {
  const t = mode & 0o170000;
  return t === 0o040000 ? "dir" : t === 0o100000 ? "file" : t === 0o120000 ? "link" : "other";
}

function runSftp(
  ws: WebSocket,
  client: Client,
  stats: { bytesIn: number; bytesOut: number },
  onActivity: () => void,
  session: typeof schema.connectionSession.$inferSelect,
  ip: string | null,
) {
  return new Promise<void>((resolve, reject) => {
    client.sftp((err, sftp: SFTPWrapper) => {
      if (err) return reject(new GatewayError("INTERNAL", "SFTP ist auf diesem Server nicht verfügbar."));
      let upload: { id: number; path: string; size: number; received: number; stream: NodeJS.WritableStream } | null = null;
      let busy = false;
      const ok = (id: number, extra: Partial<Extract<ServerControl, { type: "sftp-result"; ok: true }>> = {}) =>
        sendControl(ws, { type: "sftp-result", id, ok: true, ...extra });
      const fail = (id: number, e: unknown) =>
        sendControl(ws, { type: "sftp-result", id, ok: false, message: (e as Error)?.message || "Fehler" });
      const logAction = (action: string, metadata: Record<string, unknown>) =>
        audit({ action, actorId: session.userId, organizationId: session.organizationId, targetType: "server", targetId: session.serverId ?? undefined, ip, metadata: { sessionId: session.id, linuxUser: session.linuxUser, ...metadata } });

      sftp.realpath(".", (e, home) => ok(0, { home: e ? "/" : home }));

      ws.on("message", (data: RawData, isBinary: boolean) => {
        onActivity();
        if (isBinary) {
          if (!upload) return;
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          upload.received += buf.length;
          stats.bytesIn += buf.length;
          if (upload.received > upload.size) {
            fail(upload.id, new Error("Mehr Daten als angekündigt."));
            upload.stream.end();
            upload = null;
            return;
          }
          upload.stream.write(buf);
          return;
        }
        let msg: ClientControl;
        try {
          msg = JSON.parse(data.toString()) as ClientControl;
        } catch {
          return;
        }
        if (msg.type !== "sftp") return;
        const id = msg.id;
        switch (msg.op) {
          case "list":
            return sftp.readdir(msg.path, (e, list) => {
              if (e) return fail(id, e);
              const entries: SftpEntry[] = list
                .map((f) => ({ name: f.filename, type: entryType(f.attrs.mode), size: f.attrs.size, mode: f.attrs.mode & 0o7777, mtime: f.attrs.mtime }))
                .sort((a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1) || a.name.localeCompare(b.name));
              ok(id, { entries });
            });
          case "mkdir":
            return sftp.mkdir(msg.path, (e) => (e ? fail(id, e) : (ok(id), void logAction("sftp.mkdir", { path: (msg as { path: string }).path }))));
          case "delete": {
            const path = msg.path;
            const cb = (e: Error | null | undefined) => (e ? fail(id, e) : (ok(id), void logAction("sftp.delete", { path })));
            return msg.directory ? sftp.rmdir(path, cb) : sftp.unlink(path, cb);
          }
          case "rename": {
            const { from, to } = msg;
            return sftp.rename(from, to, (e) => (e ? fail(id, e) : (ok(id), void logAction("sftp.rename", { from, to }))));
          }
          case "download": {
            if (busy) return fail(id, new Error("Es läuft schon eine Übertragung."));
            const path = msg.path;
            return sftp.stat(path, (e, attrs) => {
              if (e) return fail(id, e);
              if (attrs.size > SFTP_MAX_TRANSFER_BYTES) return fail(id, new Error("Die Datei ist größer als 100 MB."));
              busy = true;
              ok(id, { size: attrs.size });
              const rs = sftp.createReadStream(path);
              rs.on("data", (chunk: Buffer) => {
                stats.bytesOut += chunk.length;
                ws.send(chunk, { binary: true });
                if (ws.bufferedAmount > 4 * 1024 * 1024) {
                  rs.pause();
                  const wait = setInterval(() => {
                    if (ws.bufferedAmount < 1024 * 1024) {
                      clearInterval(wait);
                      rs.resume();
                    }
                  }, 20);
                }
              });
              rs.on("end", () => {
                busy = false;
                sendControl(ws, { type: "sftp-data-end", id });
                void logAction("sftp.download", { path, size: attrs.size });
              });
              rs.on("error", (er: Error) => {
                busy = false;
                fail(id, er);
              });
            });
          }
          case "upload-start": {
            if (busy) return fail(id, new Error("Es läuft schon eine Übertragung."));
            if (msg.size > SFTP_MAX_TRANSFER_BYTES) return fail(id, new Error("Die Datei ist größer als 100 MB."));
            busy = true;
            const stream = sftp.createWriteStream(msg.path);
            stream.on("error", (er: Error) => {
              busy = false;
              upload = null;
              fail(id, er);
            });
            upload = { id, path: msg.path, size: msg.size, received: 0, stream };
            return ok(id);
          }
          case "upload-end": {
            const u = upload;
            if (!u) return fail(id, new Error("Keine Übertragung aktiv."));
            upload = null;
            u.stream.end(() => {
              busy = false;
              if (u.received !== u.size) return fail(id, new Error("Die Übertragung ist unvollständig."));
              ok(id);
              void logAction("sftp.upload", { path: u.path, size: u.size });
            });
            return;
          }
        }
      });
      resolve();
    });
  });
}

/** Beim Start: Sitzungen, die beim letzten Beenden noch offen waren, als geschlossen markieren */
export async function closeStaleSessions() {
  await db
    .update(schema.connectionSession)
    .set({ status: "closed", endedAt: new Date(), endReason: "Gateway neu gestartet", tokenHash: null })
    .where(sql`${schema.connectionSession.status} IN ('active', 'pending')`);
}
