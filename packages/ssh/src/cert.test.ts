import { describe, expect, it } from "vitest";
import { generateCaKey, importCaPrivateKey, parseCertificate, signUserCertificate } from "./cert";
import { generateSshKey } from "./keys";

describe("SSH-Zertifikate", () => {
  it("stellt ein Zertifikat aus, das sich wieder lesen lässt", async () => {
    const ca = await generateCaKey("test-ca");
    const user = await generateSshKey("ed25519", "anna@test");
    const validAfter = new Date("2030-01-01T00:00:00Z");
    const validBefore = new Date("2030-01-01T00:15:00Z");
    const cert = await signUserCertificate({
      caPrivateKey: await importCaPrivateKey(ca.privateKeyPkcs8),
      caPublicKey: ca.publicKey,
      userPublicKey: user.publicKey,
      keyId: "anna",
      principals: ["anna", "deploy"],
      validAfter,
      validBefore,
      serial: 7n,
    });
    expect(cert.startsWith("ssh-ed25519-cert-v01@openssh.com ")).toBe(true);
    const info = await parseCertificate(cert);
    expect(info).toMatchObject({ keyId: "anna", principals: ["anna", "deploy"], serial: 7n, caFingerprint: ca.fingerprint });
    expect(info.validBefore.getTime() - info.validAfter.getTime()).toBe(15 * 60_000);
  });

  it("verlangt mindestens einen Principal", async () => {
    const ca = await generateCaKey("test-ca");
    const user = await generateSshKey("ecdsa", "x");
    await expect(
      signUserCertificate({
        caPrivateKey: await importCaPrivateKey(ca.privateKeyPkcs8),
        caPublicKey: ca.publicKey,
        userPublicKey: user.publicKey,
        keyId: "x",
        principals: [],
        validAfter: new Date(),
        validBefore: new Date(),
        serial: 1n,
      }),
    ).rejects.toThrow("Principal");
  });
});
