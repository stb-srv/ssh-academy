import { parseCidrList } from "@ssh-academy/ssh/net";

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} ist nicht gesetzt`);
  return v;
}

const int = (name: string, fallback: number) => {
  const v = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} muss eine positive Zahl sein`);
  return v;
};

export const config = {
  port: int("GATEWAY_PORT", 4000),
  databaseUrl: required("DATABASE_URL"),
  /** Gemeinsames Geheimnis mit der Web-App für die interne API */
  internalToken: required("GATEWAY_INTERNAL_TOKEN"),
  /** Erlaubte Herkunft für WebSocket-Verbindungen (Adresse der Web-App) */
  appOrigin: process.env.APP_URL ? new URL(process.env.APP_URL).origin : null,
  dataDir: process.env.GATEWAY_DATA_DIR ?? "/data",
  allowedNetworks: parseCidrList(process.env.SSH_ALLOWED_NETWORKS),
  connectTimeoutMs: int("SSH_CONNECT_TIMEOUT_SECONDS", 15) * 1000,
  maxConcurrentSessionsPerUser: int("SSH_MAX_SESSIONS_PER_USER", 5),
  maxRecordingBytes: int("SSH_MAX_RECORDING_MB", 20) * 1024 * 1024,
};

if (config.internalToken.length < 32) throw new Error("GATEWAY_INTERNAL_TOKEN muss mindestens 32 Zeichen lang sein");
