import "server-only";
import type {
  CreateCaRequest,
  CreateCaResult,
  Credentials,
  HostKeyResult,
  RunResult,
  SignCertRequest,
  SignCertResult,
} from "@ssh-academy/ssh/protocol";
import { wrapForExecution, type RemoteOp } from "@ssh-academy/ssh/ops";
import { env, gatewayEnabled } from "./env";

export class GatewayUnavailableError extends Error {
  constructor() {
    super("Das SSH-Gateway ist nicht erreichbar. Läuft der Dienst „gateway“?");
    this.name = "GatewayUnavailableError";
  }
}

async function call<T>(path: string, body?: unknown, timeoutMs = 130_000): Promise<T> {
  if (!gatewayEnabled) throw new GatewayUnavailableError();
  try {
    const res = await fetch(new URL(path, env.GATEWAY_INTERNAL_URL), {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${env.GATEWAY_INTERNAL_TOKEN}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok && res.status !== 500) throw new GatewayUnavailableError();
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof GatewayUnavailableError) throw err;
    console.error("[gateway]", path, (err as Error).message);
    throw new GatewayUnavailableError();
  }
}

export function getVaultPublicKey() {
  return call<{ version: number; publicKey: string }>("/internal/vault-key");
}

export function scanHostKey(host: string, port: number) {
  return call<HostKeyResult>("/internal/hostkey", { host, port }, 30_000);
}

export type ServerTarget = { host: string; port: number; hostKeyFingerprint: string | null };

/** Führt ein Plattform-Skript auf einem Server aus */
export function runOp(
  server: ServerTarget,
  credentials: Credentials,
  op: RemoteOp,
  opts: { sudoPassword?: string; stdinLines?: string[]; timeoutMs?: number } = {},
) {
  const usesSudo = op.needsRoot && credentials.username !== "root";
  const sudoPassword = usesSudo ? opts.sudoPassword || (credentials.method === "password" ? credentials.password : undefined) : undefined;
  return call<RunResult>("/internal/run", {
    target: { host: server.host, port: server.port, hostKeyFingerprint: server.hostKeyFingerprint ?? "" },
    credentials,
    command: wrapForExecution(op, credentials.username, sudoPassword !== undefined),
    sudoPassword,
    stdinLines: opts.stdinLines,
    timeoutMs: opts.timeoutMs,
  });
}

export function createCa(req: CreateCaRequest) {
  return call<CreateCaResult>("/internal/ca", req);
}

export function signCertificate(req: SignCertRequest) {
  return call<SignCertResult>("/internal/sign", req);
}
