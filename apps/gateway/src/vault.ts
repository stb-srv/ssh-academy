/**
 * Tresor-Schlüssel des Gateways. Liegen nur im Daten-Volume des Gateways, nie in der Web-App.
 * Ohne diese Datei sind alle Tresor-Keys unbrauchbar: unbedingt sichern (getrennt von DB-Backups).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { generateVaultKeyPair, importVaultPrivateKey, importVaultPublicKey, seal, unseal, type SealedSecret } from "@ssh-academy/ssh/vault";
import { config } from "./config";

type VaultFile = { active: number; keys: Record<string, { publicKey: string; privateKey: string; createdAt: string }> };

const file = path.join(config.dataDir, "vault-keys.json");
let state: VaultFile | null = null;
const privateKeys = new Map<number, CryptoKey>();

export async function loadVault() {
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  if (!existsSync(file)) {
    const pair = await generateVaultKeyPair();
    const fresh: VaultFile = { active: 1, keys: { "1": { ...pair, createdAt: new Date().toISOString() } } };
    writeFileSync(`${file}.tmp`, JSON.stringify(fresh, null, 2), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
    console.warn(`[tresor] Neuer Tresor-Schlüssel erzeugt: ${file}. Bitte sicher aufbewahren!`);
  }
  state = JSON.parse(readFileSync(file, "utf8")) as VaultFile;
  privateKeys.clear();
  for (const [version, k] of Object.entries(state.keys)) privateKeys.set(Number(version), await importVaultPrivateKey(k.privateKey));
  return state;
}

export function activeVaultKey() {
  if (!state) throw new Error("Tresor nicht geladen");
  return { version: state.active, publicKey: state.keys[String(state.active)]!.publicKey };
}

export async function openSecret(secret: SealedSecret) {
  const key = privateKeys.get(secret.kekVersion);
  if (!key) throw new Error(`Tresor-Schlüssel Version ${secret.kekVersion} fehlt`);
  return unseal(secret, key);
}

export async function sealSecret(plaintext: string) {
  const { version, publicKey } = activeVaultKey();
  return seal(plaintext, await importVaultPublicKey(publicKey), version);
}
