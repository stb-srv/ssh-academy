import { describe, expect, it } from "vitest";
import { deployKey, isValidLinuxUser, keyMaterial, parseOsOutput, parsePrivileges, shellQuote, wrapForExecution } from "./ops";

const KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO+09zmMpgnoRKkNAviYqzPUabc it's; $(rm -rf /)";

describe("Server-Skripte", () => {
  it("prüft Linux-Benutzernamen", () => {
    expect(isValidLinuxUser("anna")).toBe(true);
    expect(isValidLinuxUser("Anna")).toBe(false);
    expect(isValidLinuxUser("x;rm")).toBe(false);
    expect(() => deployKey({ user: "a b", publicKeyLine: KEY, asRoot: true })).toThrow();
  });

  it("nimmt den Kommentar nicht in den Suchbegriff auf", () => {
    expect(keyMaterial(KEY)).toBe("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO+09zmMpgnoRKkNAviYqzPUabc");
    expect(() => keyMaterial("ssh-ed25519 abc$def")).toThrow();
  });

  it("setzt gefährliche Kommentare in Anführungszeichen", () => {
    const script = deployKey({ user: "anna", publicKeyLine: KEY, asRoot: true }).script;
    expect(script).toContain(`KEY=${shellQuote(KEY)}`);
    expect(shellQuote(KEY)).toMatch(/^'.*'$/);
  });

  it("nutzt sudo nur, wenn nötig", () => {
    const op = { title: "", needsRoot: true, script: "id" };
    expect(wrapForExecution(op, "root", false)).toBe("sh -c id");
    expect(wrapForExecution(op, "anna", false)).toBe("sudo -n sh -c id");
    expect(wrapForExecution(op, "anna", true)).toBe("sudo -k -S -p '' sh -c id");
    expect(wrapForExecution({ ...op, needsRoot: false }, "anna", true)).toBe("sh -c id");
  });

  it("liest Ausgaben", () => {
    expect(parseOsOutput("ubuntu|24.04|Ubuntu 24.04.1 LTS\n")).toEqual({ os: "ubuntu", version: "24.04", pretty: "Ubuntu 24.04.1 LTS" });
    expect(parseOsOutput("fedora|40|Fedora").os).toBe("other");
    expect(parsePrivileges("user=anna\ngroups=anna sudo\nsudo=password\n")).toEqual({ user: "anna", groups: ["anna", "sudo"], sudo: "password" });
  });
});
