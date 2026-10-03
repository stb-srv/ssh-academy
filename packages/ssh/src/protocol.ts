/** Gemeinsame Typen für die Kommunikation zwischen Web-App, Gateway und Browser */

export type GatewayErrorCode =
  | "HOST_KEY_MISMATCH"
  | "HOST_KEY_UNCONFIRMED"
  | "AUTH_FAILED"
  | "UNREACHABLE"
  | "BLOCKED_ADDRESS"
  | "TIMEOUT"
  | "KEY_UNAVAILABLE"
  | "SUDO_FAILED"
  | "BAD_REQUEST"
  | "INTERNAL";

export const GATEWAY_ERROR_TEXT: Record<GatewayErrorCode, string> = {
  HOST_KEY_MISMATCH:
    "Der Host-Key des Servers hat sich geändert. Die Verbindung wurde zu deinem Schutz abgebrochen. Prüfe, ob der Server neu installiert wurde, und bestätige den neuen Fingerprint nur, wenn du sicher bist.",
  HOST_KEY_UNCONFIRMED: "Der Fingerprint des Servers ist noch nicht bestätigt.",
  AUTH_FAILED: "Anmeldung abgelehnt. Stimmen Benutzer, Passwort bzw. ist der Key auf dem Server hinterlegt?",
  UNREACHABLE: "Der Server ist nicht erreichbar. Stimmen Adresse und Port, und lässt die Firewall SSH durch?",
  BLOCKED_ADDRESS: "Diese Adresse ist für das Gateway gesperrt (privates oder internes Netz).",
  TIMEOUT: "Zeitüberschreitung: Der Server hat nicht rechtzeitig geantwortet.",
  KEY_UNAVAILABLE: "Der Key liegt nicht im Tresor und kann deshalb nicht für Verbindungen genutzt werden.",
  SUDO_FAILED: "sudo hat nicht funktioniert. Ist der Benutzer in der Gruppe sudo, und stimmt das Passwort?",
  BAD_REQUEST: "Ungültige Anfrage.",
  INTERNAL: "Interner Fehler im Gateway.",
};

export type Target = { host: string; port: number; hostKeyFingerprint: string };

export type Credentials =
  | { username: string; method: "key"; keyId: string }
  | { username: string; method: "password"; password: string };

export type RunRequest = {
  target: Target;
  credentials: Credentials;
  command: string;
  /** Wird als erste stdin-Zeile an sudo -S gegeben */
  sudoPassword?: string;
  /** Weitere geheime stdin-Zeilen (z. B. neues Passwort); werden nie geloggt */
  stdinLines?: string[];
  timeoutMs?: number;
};

export type RunResult =
  | { ok: true; exitCode: number; stdout: string; stderr: string }
  | { ok: false; error: GatewayErrorCode; message: string; exitCode?: number; stdout?: string; stderr?: string };

export type HostKeyRequest = { host: string; port: number };
export type HostKeyResult =
  | { ok: true; algorithm: string; fingerprint: string; publicKey: string; banner: string | null; address: string }
  | { ok: false; error: GatewayErrorCode; message: string };

export type SignCertRequest = {
  caId: string;
  publicKey: string;
  keyId: string;
  principals: string[];
  validSeconds: number;
  extensions?: string[];
};
export type SignCertResult = { ok: true; certificate: string; serial: string; validAfter: string; validBefore: string } | { ok: false; error: GatewayErrorCode; message: string };

export type CreateCaRequest = { name: string; ownerUserId?: string; organizationId?: string; createdBy: string };
export type CreateCaResult = { ok: true; caId: string; publicKey: string; fingerprint: string } | { ok: false; error: GatewayErrorCode; message: string };

/** WebSocket: Steuernachrichten (Text-Frames). Terminal-Daten laufen als Binär-Frames. */
export type ClientControl =
  | { type: "resize"; cols: number; rows: number }
  | { type: "ping" }
  /** Passwort für eine Verbindung ohne Tresor-Key (nur für diese eine Verbindung, wird nie gespeichert) */
  | { type: "auth"; password: string }
  // SFTP
  | { type: "sftp"; id: number; op: "list"; path: string }
  | { type: "sftp"; id: number; op: "stat"; path: string }
  | { type: "sftp"; id: number; op: "mkdir"; path: string }
  | { type: "sftp"; id: number; op: "delete"; path: string; directory: boolean }
  | { type: "sftp"; id: number; op: "rename"; from: string; to: string }
  | { type: "sftp"; id: number; op: "download"; path: string }
  | { type: "sftp"; id: number; op: "upload-start"; path: string; size: number }
  | { type: "sftp"; id: number; op: "upload-end" };

export type SftpEntry = { name: string; type: "file" | "dir" | "link" | "other"; size: number; mode: number; mtime: number };

export type ServerControl =
  | { type: "status"; state: "connecting" | "connected" | "closed"; message?: string }
  | { type: "error"; code: GatewayErrorCode; message: string }
  | { type: "exit"; code: number | null; reason: string }
  | { type: "notice"; message: string }
  | { type: "need-password"; prompt: string }
  | { type: "sftp-result"; id: number; ok: true; entries?: SftpEntry[]; size?: number; home?: string }
  | { type: "sftp-result"; id: number; ok: false; message: string }
  | { type: "sftp-data-end"; id: number };

export const SFTP_MAX_TRANSFER_BYTES = 100 * 1024 * 1024;
