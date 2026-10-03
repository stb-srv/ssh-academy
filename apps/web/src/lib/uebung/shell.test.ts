import { describe, expect, it } from "vitest";
import { aufgabenFuer } from "./aufgaben";
import { applyMode, SimShell, tokenize, type Result } from "./shell";

/** Führt einen Befehl aus und beantwortet Rückfragen der Reihe nach */
async function run(sh: SimShell, line: string, answers: string[] = []) {
  let r: Result = await sh.exec(line);
  const out = [r.out];
  while (r.ask) {
    const a = answers.shift();
    if (a === undefined) throw new Error(`Unbeantwortete Rückfrage: ${r.ask.prompt}`);
    r = await r.ask.answer(a);
    out.push(r.out);
  }
  return out.filter(Boolean).join("\n");
}

const done = (sh: SimShell) => aufgabenFuer(sh.distro).filter((a) => a.check(sh)).map((a) => a.id);

describe("Übungsterminal", () => {
  it("zerlegt Befehlszeilen wie bash", () => {
    expect(tokenize(`echo "a b" 'c' d\\ e >> f && ls`)).toEqual([
      { word: "echo" }, { word: "a b" }, { word: "c" }, { word: "d e" }, { op: ">>" }, { word: "f" }, { op: "&&" }, { word: "ls" },
    ]);
    expect(applyMode(0o644, "go-rwx", false)).toBe(0o600);
    expect(applyMode(0o600, "u+x", false)).toBe(0o700);
    expect(applyMode(0o777, "700", true)).toBe(0o700);
  });

  it("löst alle Aufgaben auf Ubuntu", async () => {
    const sh = new SimShell("ubuntu");
    expect(done(sh)).toEqual([]);
    await run(sh, "ssh-keygen -t ed25519 -C test", ["", "", ""]);
    expect(done(sh)).toContain("keygen");
    await run(sh, "sudo adduser anna", ["uebung", "geheim", "geheim"]);
    await run(sh, "sudo usermod -aG sudo anna");
    expect(done(sh)).toEqual(expect.arrayContaining(["adduser", "sudo-anna"]));
    expect(await run(sh, "ssh-copy-id anna@localhost", ["geheim"])).toContain("Number of key(s) added: 1");
    expect(done(sh)).toContain("authorized-keys");
    expect(await run(sh, "ssh anna@localhost")).toContain("per SSH-Key");
    expect(sh.session.user).toBe("anna");
    await run(sh, "exit");
    await run(sh, 'echo "PasswordAuthentication no" | sudo tee /etc/ssh/sshd_config.d/10-haertung.conf');
    await run(sh, "echo PermitRootLogin no | sudo tee -a /etc/ssh/sshd_config.d/10-haertung.conf");
    expect(done(sh)).not.toContain("haerten"); // erst nach reload aktiv
    await run(sh, "sudo sshd -t && sudo systemctl reload ssh");
    expect(done(sh)).toEqual(aufgabenFuer("ubuntu").map((a) => a.id));
  });

  it("Debian: sudo fehlt, Gruppen gelten erst nach neuer Anmeldung", async () => {
    const sh = new SimShell("debian");
    expect(await run(sh, "sudo ls")).toContain("Befehl nicht gefunden");
    await run(sh, "su -", ["root"]);
    expect(sh.session.user).toBe("root");
    await run(sh, "apt install sudo && usermod -aG sudo schueler");
    await run(sh, "exit");
    expect(await run(sh, "sudo ls")).toContain("erst nach einer neuen Anmeldung");
    await run(sh, "su - schueler", ["uebung"]);
    expect(done(sh)).toContain("debian-sudo");
    expect(await run(sh, "sudo whoami", ["uebung"])).toBe("root");
  });

  it("erklärt typische Fehler", async () => {
    const sh = new SimShell("ubuntu");
    await run(sh, "ssh-keygen -f ~/.ssh/id_ed25519 -N ''");
    await run(sh, "sudo adduser bob", ["uebung", "pw", "pw"]);
    // Umleitung läuft als normaler Benutzer, nicht als root
    expect(await run(sh, "sudo echo x > /etc/ssh/sshd_config.d/a.conf")).toContain("Keine Berechtigung");
    // Falsche Rechte: authorized_keys für andere schreibbar
    await run(sh, "sudo mkdir -p ~bob/.ssh");
    await run(sh, "cat ~/.ssh/id_ed25519.pub | sudo tee ~bob/.ssh/authorized_keys");
    await run(sh, "sudo chown -R bob:bob ~bob/.ssh && sudo chmod 666 ~bob/.ssh/authorized_keys");
    expect(await run(sh, "ssh bob@localhost", ["falsch"])).toContain("Permission denied");
    await run(sh, "sudo chmod 600 ~bob/.ssh/authorized_keys");
    expect(await run(sh, "ssh bob@localhost")).toContain("per SSH-Key");
    await run(sh, "exit");
    // Tippfehler in der sshd-Konfiguration verhindert den Reload
    await run(sh, "echo 'PasswordAuthentification no' | sudo tee /etc/ssh/sshd_config.d/b.conf");
    expect(await run(sh, "sudo sshd -t")).toContain("Bad configuration option");
    expect(await run(sh, "sudo systemctl reload ssh")).toContain("alte Konfiguration bleibt aktiv");
    // Ohne Rechte kein Zugriff auf fremde Homes
    expect(await run(sh, "ls /root")).toContain("Keine Berechtigung");
    expect(await run(sh, "cat /etc/shadow")).toContain("Keine Berechtigung");
  });
});
