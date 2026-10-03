import { describe, expect, it } from "vitest";
import { buildConfigEntry, DEFAULT_COMMAND_INPUT, RECIPES, shellQuote } from "./befehle";
import { diagnose } from "./fehler";
import { checkPermissions, modeToOctal } from "./rechte";
import { buildSshdConfig, DEFAULT_SSHD_OPTIONS } from "./sshd-config";

describe("Befehls-Baukasten", () => {
  const cmd = (id: string, patch = {}) => RECIPES.find((r) => r.id === id)!.build({ ...DEFAULT_COMMAND_INPUT, ...patch });

  it("lässt Port 22 weg und nutzt -P bei scp", () => {
    expect(cmd("connect")).toBe("ssh -i ~/.ssh/id_ed25519 anna@server.example.org");
    expect(cmd("scp-up", { port: 2222 })).toContain(" -P 2222 ");
    expect(cmd("connect", { port: 2222, jumpHost: "bastion" })).toBe("ssh -i ~/.ssh/id_ed25519 -p 2222 -J bastion anna@server.example.org");
  });

  it("schützt Sonderzeichen", () => {
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(cmd("connect", { host: "x; rm -rf /" })).toContain("'x; rm -rf /'");
  });

  it("schreibt den known_hosts-Eintrag mit Port in Klammern", () => {
    expect(cmd("known-hosts-remove", { port: 2222 })).toBe("ssh-keygen -R '[server.example.org]:2222'");
  });

  it("baut einen ~/.ssh/config-Eintrag", () => {
    expect(buildConfigEntry({ ...DEFAULT_COMMAND_INPUT, port: 2222 })).toContain("    Port 2222");
  });
});

describe("sshd-Konfigurator", () => {
  it("erzeugt sichere Standardwerte", () => {
    const { config } = buildSshdConfig(DEFAULT_SSHD_OPTIONS);
    expect(config).toContain("PermitRootLogin no");
    expect(config).toContain("PasswordAuthentication no");
    expect(config).not.toMatch(/^Port /m);
  });

  it("warnt bei Root-Login mit Passwort und filtert ungültige Namen", () => {
    const { config, warnings } = buildSshdConfig({ ...DEFAULT_SSHD_OPTIONS, rootLogin: "yes", allowUsers: ["anna", "böse;name"] });
    expect(config).toContain("AllowUsers anna\n");
    expect(warnings.some((w) => w.level === "danger")).toBe(true);
    expect(warnings.some((w) => w.text.includes("Ungültige"))).toBe(true);
  });
});

describe("Fehler-Doktor", () => {
  it("erkennt typische Meldungen", () => {
    expect(diagnose("anna@1.2.3.4: Permission denied (publickey).").map((d) => d.id)).toEqual(["permission-denied-publickey"]);
    expect(diagnose("@@@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @@@")[0]!.id).toBe("host-key-changed");
    expect(diagnose("Permissions 0644 for '/home/a/.ssh/id_ed25519' are too open.")[0]!.id).toBe("unprotected-private-key");
    expect(diagnose("")).toEqual([]);
  });
});

describe("Rechte-Checker", () => {
  it("rechnet Modus-Strings um", () => {
    expect(modeToOctal("-rw-------")).toBe(0o600);
    expect(modeToOctal("drwxr-xr-x")).toBe(0o755);
  });

  it("findet zu offene Dateien", () => {
    const out = [
      "drwxrwxr-x 20 anna anna 4096 Mar  3 10:00 /home/anna",
      "drwxr-xr-x  2 anna anna 4096 Mar  3 10:00 /home/anna/.ssh",
      "-rw-r--r--  1 anna anna  411 Mar  3 10:00 /home/anna/.ssh/id_ed25519",
      "-rw-r--r--  1 anna anna  100 Mar  3 10:00 /home/anna/.ssh/id_ed25519.pub",
      "-rw-------  1 anna anna  100 2025-03-03 10:00 /home/anna/.ssh/authorized_keys",
    ].join("\n");
    const r = checkPermissions(out);
    expect(r.map((f) => [f.path, f.ok, f.fix])).toEqual([
      ["/home/anna", false, "chmod 755 /home/anna"],
      ["/home/anna/.ssh", false, "chmod 700 /home/anna/.ssh"],
      ["/home/anna/.ssh/id_ed25519", false, "chmod 600 /home/anna/.ssh/id_ed25519"],
      ["/home/anna/.ssh/id_ed25519.pub", true, undefined],
      ["/home/anna/.ssh/authorized_keys", true, undefined],
    ]);
  });
});
