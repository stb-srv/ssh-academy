/**
 * Tresor: Envelope Encryption für Private Keys (siehe Projektkonzept 5.1).
 *
 * Jeder Key bekommt einen eigenen Datenschlüssel (DEK, AES-256-GCM). Der DEK wird mit dem
 * öffentlichen Tresor-Schlüssel des Gateways (RSA-OAEP, SHA-256) verpackt. Verschlüsseln kann
 * daher jeder, der den öffentlichen Schlüssel kennt (der Browser), entschlüsseln nur das Gateway.
 * Läuft im Browser und in Node (nur WebCrypto).
 */
import { concat, fromBase64, toBase64 } from "./keys";

export type SealedSecret = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  wrappedDek: string;
  kekVersion: number;
};

const RSA_OAEP = { name: "RSA-OAEP", hash: "SHA-256" } as const;
const TAG_BYTES = 16;

export async function generateVaultKeyPair() {
  const pair = (await crypto.subtle.generateKey(
    { ...RSA_OAEP, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["encrypt", "decrypt"],
  )) as CryptoKeyPair;
  return {
    publicKey: toBase64(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey))),
    privateKey: toBase64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))),
  };
}

export function importVaultPublicKey(spkiBase64: string) {
  return crypto.subtle.importKey("spki", fromBase64(spkiBase64) as BufferSource, RSA_OAEP, false, ["encrypt"]);
}

export function importVaultPrivateKey(pkcs8Base64: string) {
  return crypto.subtle.importKey("pkcs8", fromBase64(pkcs8Base64) as BufferSource, RSA_OAEP, false, ["decrypt"]);
}

export async function seal(plaintext: string, vaultPublicKey: CryptoKey, kekVersion: number): Promise<SealedSecret> {
  const dekRaw = crypto.getRandomValues(new Uint8Array(32));
  const dek = await crypto.subtle.importKey("raw", dekRaw, "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, dek, new TextEncoder().encode(plaintext)),
  );
  const wrapped = new Uint8Array(await crypto.subtle.encrypt(RSA_OAEP, vaultPublicKey, dekRaw));
  dekRaw.fill(0);
  return {
    ciphertext: toBase64(sealed.subarray(0, sealed.length - TAG_BYTES)),
    authTag: toBase64(sealed.subarray(sealed.length - TAG_BYTES)),
    nonce: toBase64(nonce),
    wrappedDek: toBase64(wrapped),
    kekVersion,
  };
}

export async function unseal(secret: SealedSecret, vaultPrivateKey: CryptoKey): Promise<string> {
  const dekRaw = new Uint8Array(
    await crypto.subtle.decrypt(RSA_OAEP, vaultPrivateKey, fromBase64(secret.wrappedDek) as BufferSource),
  );
  const dek = await crypto.subtle.importKey("raw", dekRaw, "AES-GCM", false, ["decrypt"]);
  dekRaw.fill(0);
  const data = concat(fromBase64(secret.ciphertext), fromBase64(secret.authTag));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(secret.nonce) as BufferSource },
    dek,
    data as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

/** Prüft grob, ob ein Text ein unverschlüsselter OpenSSH-Private-Key ist (vor dem Versiegeln im Browser). */
export function looksLikeOpenSshPrivateKey(text: string) {
  return /^-----BEGIN OPENSSH PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+\n-----END OPENSSH PRIVATE KEY-----\n?$/.test(
    text.replace(/\r\n/g, "\n").trim() + "\n",
  );
}
