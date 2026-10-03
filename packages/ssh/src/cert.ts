/**
 * SSH-Zertifizierungsstelle (Phase 4): Benutzer-Zertifikate im OpenSSH-Format
 * (PROTOCOL.certkeys) mit einem Ed25519-CA-Schlüssel ausstellen. Nur WebCrypto.
 */
import { fingerprintOf, fromBase64, Reader, toBase64, Writer } from "./keys";

const CERT_TYPES: Record<string, string> = {
  "ssh-ed25519": "ssh-ed25519-cert-v01@openssh.com",
  "ssh-rsa": "ssh-rsa-cert-v01@openssh.com",
  "ecdsa-sha2-nistp256": "ecdsa-sha2-nistp256-cert-v01@openssh.com",
  "ecdsa-sha2-nistp384": "ecdsa-sha2-nistp384-cert-v01@openssh.com",
  "ecdsa-sha2-nistp521": "ecdsa-sha2-nistp521-cert-v01@openssh.com",
  "sk-ssh-ed25519@openssh.com": "sk-ssh-ed25519-cert-v01@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com": "sk-ecdsa-sha2-nistp256-cert-v01@openssh.com",
};

/** Standard-Erweiterungen wie bei `ssh-keygen -s` ohne -O */
export const DEFAULT_EXTENSIONS = [
  "permit-X11-forwarding",
  "permit-agent-forwarding",
  "permit-port-forwarding",
  "permit-pty",
  "permit-user-rc",
];

function uint64(n: bigint) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n);
  return b;
}

export async function generateCaKey(comment: string) {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const blob = new Writer().string("ssh-ed25519").string(raw).toBytes();
  return {
    publicKey: `ssh-ed25519 ${toBase64(blob)} ${comment}`.trim(),
    privateKeyPkcs8: toBase64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))),
    fingerprint: await fingerprintOf(blob),
  };
}

export function importCaPrivateKey(pkcs8Base64: string) {
  return crypto.subtle.importKey("pkcs8", fromBase64(pkcs8Base64) as BufferSource, { name: "Ed25519" }, false, ["sign"]);
}

export type CertificateInput = {
  caPrivateKey: CryptoKey;
  caPublicKey: string;
  userPublicKey: string;
  keyId: string;
  principals: string[];
  validAfter: Date;
  validBefore: Date;
  serial: bigint;
  extensions?: string[];
};

export async function signUserCertificate(input: CertificateInput) {
  const [algorithm, data] = input.userPublicKey.trim().split(/\s+/);
  const certType = algorithm ? CERT_TYPES[algorithm] : undefined;
  if (!certType || !data) throw new Error("Für diesen Key-Typ kann kein Zertifikat ausgestellt werden.");
  if (input.principals.length === 0) throw new Error("Mindestens ein Linux-Benutzer (Principal) ist nötig.");

  // Key-Felder = Public-Key-Blob ohne den führenden Typ-String
  const userBlob = fromBase64(data);
  const r = new Reader(userBlob);
  if (r.text() !== algorithm) throw new Error("Key-Typ und Inhalt passen nicht zusammen.");
  const keyFields = r.rest();

  const caBlob = fromBase64(input.caPublicKey.trim().split(/\s+/)[1] ?? "");
  const principals = new Writer();
  for (const p of input.principals) principals.string(p);
  const extensions = new Writer();
  for (const e of [...(input.extensions ?? DEFAULT_EXTENSIONS)].sort()) extensions.string(e).string(new Uint8Array(0));

  const toSeconds = (d: Date) => BigInt(Math.floor(d.getTime() / 1000));
  const body = new Writer()
    .string(certType)
    .string(crypto.getRandomValues(new Uint8Array(32)))
    .bytes(keyFields)
    .bytes(uint64(input.serial))
    .uint32(1) // SSH_CERT_TYPE_USER
    .string(input.keyId)
    .string(principals.toBytes())
    .bytes(uint64(toSeconds(input.validAfter)))
    .bytes(uint64(toSeconds(input.validBefore)))
    .string(new Uint8Array(0)) // critical options
    .string(extensions.toBytes())
    .string(new Uint8Array(0)) // reserved
    .string(caBlob)
    .toBytes();

  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, input.caPrivateKey, body as BufferSource));
  const sigBlob = new Writer().string("ssh-ed25519").string(signature).toBytes();
  const cert = new Writer().bytes(body).string(sigBlob).toBytes();
  return `${certType} ${toBase64(cert)} ${input.keyId}`;
}

export type CertificateInfo = {
  type: string;
  serial: bigint;
  keyId: string;
  principals: string[];
  validAfter: Date;
  validBefore: Date;
  extensions: string[];
  caFingerprint: string;
};

/** Liest die wichtigsten Felder eines Zertifikats (für die Anzeige) */
export async function parseCertificate(line: string): Promise<CertificateInfo> {
  const [type, data] = line.trim().split(/\s+/);
  if (!type || !data || !Object.values(CERT_TYPES).includes(type)) throw new Error("Kein OpenSSH-Zertifikat.");
  const r = new Reader(fromBase64(data));
  r.text();
  r.string(); // nonce
  // Key-Felder je nach Typ überspringen
  const base = Object.entries(CERT_TYPES).find(([, v]) => v === type)![0];
  const fieldCount: Record<string, number> = {
    "ssh-ed25519": 1,
    "ssh-rsa": 2,
    "ecdsa-sha2-nistp256": 2,
    "ecdsa-sha2-nistp384": 2,
    "ecdsa-sha2-nistp521": 2,
    "sk-ssh-ed25519@openssh.com": 2,
    "sk-ecdsa-sha2-nistp256@openssh.com": 3,
  };
  for (let i = 0; i < fieldCount[base]!; i++) r.string();
  const u64 = () => (BigInt(r.uint32()) << 32n) | BigInt(r.uint32());
  const serial = u64();
  r.uint32();
  const keyId = r.text();
  const pr = new Reader(r.string());
  const principals: string[] = [];
  while (!pr.done) principals.push(pr.text());
  const validAfter = new Date(Number(u64()) * 1000);
  const validBefore = new Date(Number(u64()) * 1000);
  r.string();
  const er = new Reader(r.string());
  const extensions: string[] = [];
  while (!er.done) {
    extensions.push(er.text());
    er.string();
  }
  r.string();
  const caFingerprint = await fingerprintOf(r.string());
  return { type, serial, keyId, principals, validAfter, validBefore, extensions, caFingerprint };
}
