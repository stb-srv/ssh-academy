/**
 * SSH-Schlüssel im OpenSSH-Format erzeugen und lesen. Läuft im Browser und auf dem Server
 * (nur WebCrypto, keine Node-spezifischen APIs), damit Private Keys im Browser entstehen können.
 */

export type SshKeyType = "ed25519" | "rsa" | "ecdsa";

export const KEY_TYPE_LABELS: Record<SshKeyType, string> = {
  ed25519: "Ed25519 (empfohlen)",
  rsa: "RSA 4096 (für alte Systeme)",
  ecdsa: "ECDSA P-256",
};

export type GeneratedKey = {
  type: SshKeyType;
  bits: number;
  publicKey: string;
  privateKey: string;
  fingerprint: string;
};

// ---------------------------------------------------------------------------
// Binärformat (RFC 4251): uint32-Längen, Strings, mpints
// ---------------------------------------------------------------------------

class Writer {
  private parts: Uint8Array[] = [];
  bytes(b: Uint8Array) {
    this.parts.push(b);
    return this;
  }
  uint32(n: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n);
    return this.bytes(b);
  }
  string(s: Uint8Array | string) {
    const b = typeof s === "string" ? new TextEncoder().encode(s) : s;
    return this.uint32(b.length).bytes(b);
  }
  /** Vorzeichenbehaftete Ganzzahl: führende Nullen weg, bei gesetztem höchsten Bit eine 0 davor */
  mpint(b: Uint8Array) {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.subarray(i);
    if (v[0]! & 0x80) v = concat(new Uint8Array([0]), v);
    return this.string(v);
  }
  toBytes() {
    return concat(...this.parts);
  }
}

class Reader {
  private pos = 0;
  constructor(private buf: Uint8Array) {}
  uint32() {
    if (this.pos + 4 > this.buf.length) throw new Error("Unerwartetes Ende");
    const n = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getUint32(0);
    this.pos += 4;
    return n;
  }
  string() {
    const len = this.uint32();
    if (this.pos + len > this.buf.length) throw new Error("Unerwartetes Ende");
    const b = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return b;
  }
  text() {
    return new TextDecoder().decode(this.string());
  }
  get done() {
    return this.pos >= this.buf.length;
  }
}

function concat(...arrays: Uint8Array[]) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function toBase64(b: Uint8Array) {
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s);
}

export function fromBase64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fromBase64Url(s: string) {
  return fromBase64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
}

/** SHA256-Fingerprint wie bei `ssh-keygen -l` (Base64 ohne Padding) */
export async function fingerprintOf(blob: Uint8Array) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", blob as BufferSource));
  return `SHA256:${toBase64(hash).replace(/=+$/, "")}`;
}

function wrap(s: string, width = 70) {
  return s.match(new RegExp(`.{1,${width}}`, "g"))!.join("\n");
}

/** Privater Schlüssel im Format "openssh-key-v1" ohne Verschlüsselung */
function encodeOpenSshPrivateKey(publicBlob: Uint8Array, privateSection: Uint8Array, comment: string) {
  const check = crypto.getRandomValues(new Uint8Array(4));
  let priv = concat(check, check, privateSection, new Writer().string(comment).toBytes());
  // Auffüllen auf Blockgröße 8 mit 1, 2, 3, …
  const pad = (8 - (priv.length % 8)) % 8;
  priv = concat(priv, Uint8Array.from({ length: pad }, (_, i) => i + 1));

  const body = new Writer()
    .bytes(new TextEncoder().encode("openssh-key-v1\0"))
    .string("none")
    .string("none")
    .string(new Uint8Array(0))
    .uint32(1)
    .string(publicBlob)
    .string(priv)
    .toBytes();
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${wrap(toBase64(body))}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

// ---------------------------------------------------------------------------
// Erzeugen
// ---------------------------------------------------------------------------

export async function generateSshKey(type: SshKeyType, comment: string): Promise<GeneratedKey> {
  const subtle = crypto.subtle;

  if (type === "ed25519") {
    const pair = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
    const jwk = await subtle.exportKey("jwk", pair.privateKey);
    const seed = fromBase64Url(jwk.d!);
    const blob = new Writer().string("ssh-ed25519").string(pub).toBytes();
    const privSection = new Writer().string("ssh-ed25519").string(pub).string(concat(seed, pub)).toBytes();
    return {
      type,
      bits: 256,
      publicKey: `ssh-ed25519 ${toBase64(blob)} ${comment}`.trim(),
      privateKey: encodeOpenSshPrivateKey(blob, privSection, comment),
      fingerprint: await fingerprintOf(blob),
    };
  }

  if (type === "ecdsa") {
    const pair = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const q = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
    const jwk = await subtle.exportKey("jwk", pair.privateKey);
    const d = fromBase64Url(jwk.d!);
    const name = "ecdsa-sha2-nistp256";
    const blob = new Writer().string(name).string("nistp256").string(q).toBytes();
    const privSection = new Writer().string(name).string("nistp256").string(q).mpint(d).toBytes();
    return {
      type,
      bits: 256,
      publicKey: `${name} ${toBase64(blob)} ${comment}`.trim(),
      privateKey: encodeOpenSshPrivateKey(blob, privSection, comment),
      fingerprint: await fingerprintOf(blob),
    };
  }

  const pair = (await subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = await subtle.exportKey("jwk", pair.privateKey);
  const [n, e, d, p, q, qi] = [jwk.n, jwk.e, jwk.d, jwk.p, jwk.q, jwk.qi].map((v) => fromBase64Url(v!)) as [
    Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array,
  ];
  const blob = new Writer().string("ssh-rsa").mpint(e).mpint(n).toBytes();
  // OpenSSH-Reihenfolge: n, e, d, iqmp, p, q
  const privSection = new Writer().string("ssh-rsa").mpint(n).mpint(e).mpint(d).mpint(qi).mpint(p).mpint(q).toBytes();
  return {
    type: "rsa",
    bits: 4096,
    publicKey: `ssh-rsa ${toBase64(blob)} ${comment}`.trim(),
    privateKey: encodeOpenSshPrivateKey(blob, privSection, comment),
    fingerprint: await fingerprintOf(blob),
  };
}

// ---------------------------------------------------------------------------
// Public Keys lesen und prüfen
// ---------------------------------------------------------------------------

const KNOWN_TYPES: Record<string, { type: string; label: string }> = {
  "ssh-ed25519": { type: "ed25519", label: "Ed25519" },
  "ssh-rsa": { type: "rsa", label: "RSA" },
  "ecdsa-sha2-nistp256": { type: "ecdsa", label: "ECDSA P-256" },
  "ecdsa-sha2-nistp384": { type: "ecdsa", label: "ECDSA P-384" },
  "ecdsa-sha2-nistp521": { type: "ecdsa", label: "ECDSA P-521" },
  "sk-ssh-ed25519@openssh.com": { type: "ed25519-sk", label: "Ed25519 (Hardware-Key)" },
  "sk-ecdsa-sha2-nistp256@openssh.com": { type: "ecdsa-sk", label: "ECDSA (Hardware-Key)" },
};

export type ParsedPublicKey = {
  algorithm: string;
  type: "ed25519" | "rsa" | "ecdsa" | "ed25519-sk" | "ecdsa-sk";
  label: string;
  bits: number;
  blob: Uint8Array;
  comment: string;
  fingerprint: string;
  /** Normalisierte Zeile ohne Optionen */
  line: string;
};

export class PublicKeyError extends Error {}

/** Liest eine authorized_keys-Zeile bzw. den Inhalt einer .pub-Datei und prüft sie streng */
export async function parsePublicKey(input: string): Promise<ParsedPublicKey> {
  const line = input.trim().replace(/\s+/g, " ");
  if (!line) throw new PublicKeyError("Bitte einen Public Key einfügen.");
  if (line.includes("PRIVATE KEY")) {
    throw new PublicKeyError("Das ist ein Private Key! Füge nur den Public Key (Inhalt der .pub-Datei) ein und gib den Private Key niemals weiter.");
  }
  if (/[\r\n]/.test(input.trim())) throw new PublicKeyError("Der Key muss in einer einzigen Zeile stehen.");

  const parts = line.split(" ");
  const start = parts.findIndex((p) => p in KNOWN_TYPES);
  if (start < 0) throw new PublicKeyError("Unbekannter oder unsicherer Key-Typ. Erlaubt sind Ed25519, ECDSA und RSA (ab 2048 Bit).");
  if (start > 0) throw new PublicKeyError("Bitte nur den Key ohne Optionen davor einfügen.");

  const algorithm = parts[0]!;
  let blob: Uint8Array;
  try {
    blob = fromBase64(parts[1] ?? "");
  } catch {
    throw new PublicKeyError("Der Key ist beschädigt (kein gültiges Base64).");
  }

  const reader = new Reader(blob);
  let bits = 256;
  try {
    if (reader.text() !== algorithm) throw new PublicKeyError("Key-Typ und Inhalt passen nicht zusammen.");
    if (algorithm === "ssh-rsa") {
      reader.string(); // e
      const n = reader.string();
      let i = 0;
      while (n[i] === 0) i++;
      bits = (n.length - i) * 8;
      if (bits < 2048) throw new PublicKeyError(`RSA-Keys brauchen mindestens 2048 Bit (dieser hat ${bits}).`);
    } else if (algorithm === "ssh-ed25519") {
      if (reader.string().length !== 32) throw new PublicKeyError("Ungültiger Ed25519-Key.");
    } else if (algorithm.startsWith("ecdsa-sha2-")) {
      const curve = reader.text();
      reader.string();
      bits = curve === "nistp384" ? 384 : curve === "nistp521" ? 521 : 256;
    } else {
      // Hardware-Keys: Key-Daten und Application-String
      reader.string();
      if (algorithm.startsWith("sk-ecdsa")) reader.string();
      reader.text();
    }
    if (!reader.done) throw new PublicKeyError("Der Key enthält unerwartete Daten.");
  } catch (e) {
    if (e instanceof PublicKeyError) throw e;
    throw new PublicKeyError("Der Key ist beschädigt oder unvollständig.");
  }

  const comment = parts.slice(2).join(" ");
  const info = KNOWN_TYPES[algorithm]!;
  return {
    algorithm,
    type: info.type as ParsedPublicKey["type"],
    label: info.label,
    bits,
    blob,
    comment,
    fingerprint: await fingerprintOf(blob),
    line: `${algorithm} ${parts[1]}${comment ? ` ${comment}` : ""}`,
  };
}
