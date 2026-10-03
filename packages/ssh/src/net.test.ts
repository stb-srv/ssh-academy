import { describe, expect, it } from "vitest";
import { isAddressAllowed, isValidHost, parseCidrList, parseIp } from "./net";

describe("SSRF-Schutz", () => {
  it.each(["10.1.2.3", "127.0.0.1", "169.254.169.254", "192.168.178.20", "172.20.0.5", "::1", "fe80::1", "fd00::5", "::ffff:127.0.0.1", "0.0.0.0", "100.64.1.1"])(
    "sperrt %s",
    (ip) => expect(isAddressAllowed(ip).allowed).toBe(false),
  );

  it.each(["1.1.1.1", "8.8.8.8", "2a01:4f8::1", "172.32.0.1"])("erlaubt %s", (ip) => expect(isAddressAllowed(ip).allowed).toBe(true));

  it("gibt freigegebene Netze frei", () => {
    const allowed = parseCidrList("192.168.178.0/24, 10.0.0.0/8");
    expect(isAddressAllowed("192.168.178.20", allowed).allowed).toBe(true);
    expect(isAddressAllowed("192.168.1.20", allowed).allowed).toBe(false);
    expect(isAddressAllowed("10.9.9.9", allowed).allowed).toBe(true);
  });

  it("liest IPv6 korrekt", () => {
    expect(parseIp("2001:db8::1")?.value).toBe(0x20010db8000000000000000000000001n);
    expect(parseIp("::ffff:1.2.3.4")?.value).toBe(0xffff01020304n);
    expect(parseIp("1:2:3")).toBeNull();
    expect(parseIp("300.1.1.1")).toBeNull();
  });

  it("prüft Hostnamen", () => {
    expect(isValidHost("server.example.org")).toBe(true);
    expect(isValidHost("10.0.0.1")).toBe(true);
    expect(isValidHost("bad host")).toBe(false);
    expect(isValidHost("-x.de")).toBe(false);
  });

  it("meldet ungültige Freigaben", () => expect(() => parseCidrList("10.0.0.0/33")).toThrow());
});
