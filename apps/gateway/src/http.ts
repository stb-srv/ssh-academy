import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import type { CreateCaRequest, HostKeyRequest, RunRequest, SignCertRequest } from "@ssh-academy/ssh/protocol";
import { createCa, signCertificate } from "./ca";
import { config } from "./config";
import { runCommand, scanHostKey } from "./ssh";
import { activeVaultKey } from "./vault";
import { activeSessionCount } from "./sessions";

const MAX_BODY = 256 * 1024;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage) {
  const header = req.headers.authorization ?? "";
  const given = createHash("sha256").update(header.replace(/^Bearer /, "")).digest();
  const expected = createHash("sha256").update(config.internalToken).digest();
  return header.startsWith("Bearer ") && timingSafeEqual(given, expected);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("Anfrage zu groß");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export async function handleHttp(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://gateway");
  const route = url.pathname.replace(/^\/gateway/, "");

  if (route === "/health") return send(res, 200, { status: "ok", sessions: activeSessionCount() });
  if (!route.startsWith("/internal/")) return send(res, 404, { error: "Nicht gefunden" });
  if (!authorized(req)) return send(res, 401, { error: "Nicht berechtigt" });

  try {
    if (req.method === "GET" && route === "/internal/vault-key") return send(res, 200, activeVaultKey());
    if (req.method !== "POST") return send(res, 405, { error: "Methode nicht erlaubt" });

    switch (route) {
      case "/internal/hostkey": {
        const body = await readJson<HostKeyRequest>(req);
        return send(res, 200, await scanHostKey(String(body.host), Number(body.port) || 22));
      }
      case "/internal/run":
        return send(res, 200, await runCommand(await readJson<RunRequest>(req)));
      case "/internal/ca":
        return send(res, 200, await createCa(await readJson<CreateCaRequest>(req)));
      case "/internal/sign":
        return send(res, 200, await signCertificate(await readJson<SignCertRequest>(req)));
      default:
        return send(res, 404, { error: "Nicht gefunden" });
    }
  } catch (err) {
    console.error("[http]", route, (err as Error).message);
    return send(res, 500, { ok: false, error: "INTERNAL", message: "Interner Fehler im Gateway." });
  }
}
