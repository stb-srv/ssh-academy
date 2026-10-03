import { describe, expect, it } from "vitest";
import { generateSshKey } from "./keys";
import { generateVaultKeyPair, importVaultPrivateKey, importVaultPublicKey, looksLikeOpenSshPrivateKey, seal, unseal } from "./vault";

describe("Tresor", () => {
  it("versiegelt mit dem öffentlichen und öffnet mit dem privaten Schlüssel", async () => {
    const vault = await generateVaultKeyPair();
    const key = await generateSshKey("ed25519", "tresor@test");
    expect(looksLikeOpenSshPrivateKey(key.privateKey)).toBe(true);
    const sealed = await seal(key.privateKey, await importVaultPublicKey(vault.publicKey), 1);
    expect(sealed.ciphertext).not.toContain("OPENSSH");
    expect(await unseal(sealed, await importVaultPrivateKey(vault.privateKey))).toBe(key.privateKey);
  });

  it("erkennt Manipulation am Chiffretext", async () => {
    const vault = await generateVaultKeyPair();
    const sealed = await seal("geheim", await importVaultPublicKey(vault.publicKey), 1);
    const tampered = { ...sealed, authTag: btoa("x".repeat(16)) };
    await expect(unseal(tampered, await importVaultPrivateKey(vault.privateKey))).rejects.toThrow();
  });

  it("lässt sich mit einem anderen Tresor-Schlüssel nicht öffnen", async () => {
    const [a, b] = await Promise.all([generateVaultKeyPair(), generateVaultKeyPair()]);
    const sealed = await seal("geheim", await importVaultPublicKey(a.publicKey), 1);
    await expect(unseal(sealed, await importVaultPrivateKey(b.privateKey))).rejects.toThrow();
  });
});
