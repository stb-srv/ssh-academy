import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import { Client, type ConnectConfig } from "ssh2";
import { and, eq, isNull, schema } from "@ssh-academy/db";
import { isAddressAllowed } from "@ssh-academy/ssh/net";
import { GATEWAY_ERROR_TEXT, type Credentials, type GatewayErrorCode, type HostKeyResult, type RunRequest, type RunResult, type Target } from "@ssh-academy/ssh/protocol";
import { config } from "./config";
import { db } from "./db";
import { openSecret } from "./vault";

export class GatewayError extends Error {
  constructor(
    public code: GatewayErrorCode,
    message = GATEWAY_ERROR_TEXT[code],
  ) {
    super(message);
  }
}

export function fingerprint(blob: Buffer) {
  return `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`;
}

/** Löst den Namen auf und liefert die erste erlaubte Adresse (Schutz gegen SSRF und DNS-Rebinding) */
export async function resolveAllowed(host: string) {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new GatewayError("UNREACHABLE", `Der Name ${host} lässt sich nicht auflösen.`);
  }
  let reason = "";
  for (const { address } of addresses) {
    const check = isAddressAllowed(address, config.allowedNetworks);
    if (check.allowed) return address;
    reason = check.reason ?? "";
  }
  throw new GatewayError("BLOCKED_ADDRESS", reason || GATEWAY_ERROR_TEXT.BLOCKED_ADDRESS);
}

/** Private Key aus dem Tresor holen (nur für gültige, nicht widerrufene Tresor-Keys) */
export async function loadVaultKey(keyId: string) {
  const [row] = await db
    .select({ key: schema.sshKey, secret: schema.sshKeySecret })
    .from(schema.sshKey)
    .innerJoin(schema.sshKeySecret, eq(schema.sshKeySecret.keyId, schema.sshKey.id))
    .where(and(eq(schema.sshKey.id, keyId), isNull(schema.sshKey.revokedAt)));
  if (!row) throw new GatewayError("KEY_UNAVAILABLE");
  if (row.key.expiresAt && row.key.expiresAt < new Date()) throw new GatewayError("KEY_UNAVAILABLE", "Der Key ist abgelaufen.");
  return openSecret(row.secret);
}

function mapError(err: unknown): GatewayError {
  if (err instanceof GatewayError) return err;
  const e = err as { level?: string; code?: string; message?: string };
  if (e.level === "client-authentication") return new GatewayError("AUTH_FAILED");
  if (e.level === "client-timeout" || e.code === "ETIMEDOUT") return new GatewayError("TIMEOUT");
  if (e.code && ["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"].includes(e.code))
    return new GatewayError("UNREACHABLE");
  console.error("[ssh] unerwarteter Fehler", e.message ?? err);
  return new GatewayError("INTERNAL", e.message ? `Verbindungsfehler: ${e.message}` : undefined);
}

type ConnectOptions = {
  target: Target;
  credentials: Credentials;
  /** Für Terminal-Sitzungen: kein Lese-Timeout nach dem Aufbau */
  keepalive?: boolean;
};

/** Baut eine SSH-Verbindung auf. Der Host-Key muss zum bestätigten Fingerprint passen. */
export async function connect({ target, credentials, keepalive }: ConnectOptions): Promise<Client> {
  if (!target.hostKeyFingerprint) throw new GatewayError("HOST_KEY_UNCONFIRMED");
  const address = await resolveAllowed(target.host);

  const auth: Partial<ConnectConfig> =
    credentials.method === "key"
      ? { privateKey: await loadVaultKey(credentials.keyId) }
      : { password: credentials.password, tryKeyboard: true };

  return new Promise((resolve, reject) => {
    const client = new Client();
    let mismatch = false;
    client.on("keyboard-interactive", (_name, _instr, _lang, prompts, finish) => {
      // Manche Server fragen das Passwort per keyboard-interactive ab
      finish(prompts.map(() => (credentials.method === "password" ? credentials.password : "")));
    });
    client.once("ready", () => resolve(client));
    client.once("error", (err) => reject(mismatch ? new GatewayError("HOST_KEY_MISMATCH") : mapError(err)));
    client.connect({
      host: address,
      port: target.port,
      username: credentials.username,
      readyTimeout: config.connectTimeoutMs,
      keepaliveInterval: keepalive ? 30_000 : 0,
      hostVerifier: (key: Buffer) => {
        const ok = fingerprint(key) === target.hostKeyFingerprint;
        if (!ok) mismatch = true;
        return ok;
      },
      ...auth,
    });
  });
}

/** Host-Key eines Servers abfragen, ohne sich anzumelden (für die Erstbestätigung) */
export async function scanHostKey(host: string, port: number): Promise<HostKeyResult> {
  let address: string;
  try {
    address = await resolveAllowed(host);
  } catch (err) {
    const e = mapError(err);
    return { ok: false, error: e.code, message: e.message };
  }
  return new Promise((resolve) => {
    const client = new Client();
    let result: HostKeyResult | null = null;
    const finish = (r: HostKeyResult) => {
      if (!result) result = r;
    };
    client.on("error", (err) => {
      client.end();
      if (result) return resolve(result);
      const e = mapError(err);
      resolve({ ok: false, error: e.code, message: e.message });
    });
    client.on("close", () => resolve(result ?? { ok: false, error: "UNREACHABLE", message: GATEWAY_ERROR_TEXT.UNREACHABLE }));
    client.connect({
      host: address,
      port,
      username: "ssh-academy-hostkey-check",
      readyTimeout: config.connectTimeoutMs,
      hostVerifier: (key: Buffer) => {
        const algorithm = key.subarray(4, 4 + key.readUInt32BE(0)).toString();
        // Server-Software aus der Begrüßung, z. B. "OpenSSH_9.6p1" (kommt vor dem Host-Key)
        const banner = (client as unknown as { _remoteVer?: string })._remoteVer ?? null;
        finish({ ok: true, algorithm, fingerprint: fingerprint(key), publicKey: key.toString("base64"), banner, address });
        // Nach dem Host-Key abbrechen: keine Anmeldung nötig
        setImmediate(() => client.end());
        return true;
      },
      authHandler: () => false,
    });
  });
}

const SUDO_ERRORS = /incorrect password attempt|a password is required|is not in the sudoers|not allowed to execute|no tty present/i;
const MAX_OUTPUT = 1024 * 1024;

/** Führt einen Befehl aus und sammelt die Ausgabe ein */
export async function runCommand(req: RunRequest): Promise<RunResult> {
  let client: Client;
  try {
    client = await connect({ target: req.target, credentials: req.credentials });
  } catch (err) {
    const e = mapError(err);
    return { ok: false, error: e.code, message: e.message };
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.end();
      resolve({ ok: false, error: "TIMEOUT", message: "Der Befehl hat zu lange gedauert und wurde abgebrochen." });
    }, req.timeoutMs ?? 120_000);
    client.exec(req.command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        client.end();
        return resolve({ ok: false, error: "INTERNAL", message: err.message });
      }
      let stdout = "";
      let stderr = "";
      stream.on("data", (d: Buffer) => (stdout = (stdout + d.toString()).slice(-MAX_OUTPUT)));
      stream.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-MAX_OUTPUT)));
      stream.on("close", (code: number | null) => {
        clearTimeout(timer);
        client.end();
        const exitCode = code ?? -1;
        if (exitCode !== 0 && SUDO_ERRORS.test(stderr)) {
          return resolve({ ok: false, error: "SUDO_FAILED", message: GATEWAY_ERROR_TEXT.SUDO_FAILED, exitCode, stdout, stderr });
        }
        resolve({ ok: true, exitCode, stdout, stderr });
      });
      const lines = [...(req.sudoPassword !== undefined ? [req.sudoPassword] : []), ...(req.stdinLines ?? [])];
      if (lines.length) stream.write(lines.join("\n") + "\n");
      stream.end();
    });
  });
}
