import { describe, expect, it } from "vitest";
import { fromBase64, generateSshKey, parsePublicKey, PublicKeyError } from "./ssh-keys";

// Mit ssh-keygen erzeugt; Fingerprint laut "ssh-keygen -lf"
const ECDSA_384 = "ecdsa-sha2-nistp384 AAAAE2VjZHNhLXNoYTItbmlzdHAzODQAAAAIbmlzdHAzODQAAABhBLYcMVTKIU6crgKRZwqKFqo+csfvWp9NgQOrofao2D1Uix7zUaL05YFQYe2FdYlpolsORbO3fXXL0l3aJEy8PejSBUK70PgBtMVLUQgjcsvszBfHXeoG/gCA3EfMzrr0rg== root@vm";
const ECDSA_384_FP = "SHA256:USaq4PuPc69Z5+p+fNKIv/v1hGlo0nCi3F71F3Fz5hc";
const RSA_1024 = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQDJfckSUxrd85Scdbg0fBj8SC1fIq8GtKVvK92WsZuLd65zb3R6KjwnVSE4JZeAd9t6VNOLt2y+5KOOP+sBK3q+JaY6JDR38oobMeye8HM9pNsd/JydlWcxJwFQ41KhuyoRehs/dMoXJlQUBlUrqTrwPT1GhVEZQwkcKHzkc3b8Nw== root@vm";

describe("parsePublicKey", () => {
  it("liest einen echten ssh-keygen-Key und berechnet denselben Fingerprint", async () => {
    const p = await parsePublicKey(ECDSA_384 + "\n");
    expect(p.algorithm).toBe("ecdsa-sha2-nistp384");
    expect(p.bits).toBe(384);
    expect(p.comment).toBe("root@vm");
    expect(p.fingerprint).toBe(ECDSA_384_FP);
  });

  it.each([
    ["", "einfügen"],
    ["hallo welt", "Unbekannter"],
    ["-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----", "Private Key"],
    ['from="1.2.3.4" ' + ECDSA_384, "Optionen"],
    [RSA_1024, "2048"],
  ])("lehnt %j ab", async (input, msg) => {
    await expect(parsePublicKey(input)).rejects.toThrow(PublicKeyError);
    await expect(parsePublicKey(input)).rejects.toThrow(msg);
  });
});

describe("generateSshKey", () => {
  it.each(["ed25519", "ecdsa"] as const)("erzeugt %s-Paare, deren Public Key sich wieder einlesen lässt", async (type) => {
    const k = await generateSshKey(type, "test@academy");
    expect(k.privateKey).toMatch(/^-----BEGIN OPENSSH PRIVATE KEY-----\n[\s\S]+\n-----END OPENSSH PRIVATE KEY-----\n$/);
    const p = await parsePublicKey(k.publicKey);
    expect(p.fingerprint).toBe(k.fingerprint);
    expect(p.comment).toBe("test@academy");

    const body = k.privateKey.split("\n").slice(1, -2).join("");
    const raw = fromBase64(body);
    expect(new TextDecoder().decode(raw.slice(0, 14))).toBe("openssh-key-v1");
  });

  it("erzeugt RSA mit 4096 Bit", async () => {
    const k = await generateSshKey("rsa", "rsa@academy");
    const p = await parsePublicKey(k.publicKey);
    expect(p.bits).toBe(4096);
    expect(p.fingerprint).toBe(k.fingerprint);
  }, 30_000);
});
