/**
 * Simuliertes Linux-System für das Übungsterminal. Läuft komplett im Browser: Dateisystem, Benutzer,
 * Gruppen, sudo, su, ssh-keygen, ssh-copy-id, ssh und sshd verhalten sich so nah wie sinnvoll am
 * echten Ubuntu bzw. Debian, damit Gelerntes direkt übertragbar ist. Nichts davon verlässt den Browser.
 */
import { generateSshKey, type SshKeyType } from "@ssh-academy/ssh/keys";

export type Distro = "ubuntu" | "debian";

type Node = { kind: "file" | "dir"; owner: string; group: string; mode: number; content: string };
type User = { name: string; uid: number; home: string; password: string | null };
type Session = { user: string; cwd: string; groups: Set<string>; sudoUntil: number; viaSsh: boolean };

export type Ask = { prompt: string; secret?: boolean; answer: (input: string) => Promise<Result> | Result };
export type Result = { out: string; ask?: Ask };

const ok = (out = ""): Result => ({ out });
const HOSTNAME = "uebung";

export const SSHD_KEYWORDS = new Set(
  [
    "Include", "Port", "AddressFamily", "ListenAddress", "PermitRootLogin", "PasswordAuthentication", "PubkeyAuthentication",
    "KbdInteractiveAuthentication", "ChallengeResponseAuthentication", "UsePAM", "X11Forwarding", "PrintMotd", "AcceptEnv",
    "Subsystem", "AuthorizedKeysFile", "AllowUsers", "AllowGroups", "DenyUsers", "MaxAuthTries", "LoginGraceTime",
    "ClientAliveInterval", "ClientAliveCountMax", "PermitEmptyPasswords", "TrustedUserCAKeys", "AllowTcpForwarding", "HostKey",
  ].map((k) => k.toLowerCase()),
);

const DEFAULT_SSHD = `# Diese Datei ist die systemweite Konfiguration des SSH-Servers.
# Eigene Änderungen gehören besser in /etc/ssh/sshd_config.d/*.conf

Include /etc/ssh/sshd_config.d/*.conf

#Port 22
#PermitRootLogin prohibit-password
#PubkeyAuthentication yes
#PasswordAuthentication yes
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding yes
PrintMotd no
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server
`;

export class SimShell {
  readonly distro: Distro;
  private fs = new Map<string, Node>();
  private users = new Map<string, User>();
  private groups = new Map<string, Set<string>>();
  private sessions: Session[] = [];
  private sudoInstalled: boolean;
  /** Konfiguration, mit der sshd gerade läuft (erst nach reload aktiv) */
  activeSshd = new Map<string, string>();
  /** Erfolgreiche SSH-Anmeldungen: "user:methode" */
  readonly logins = new Set<string>();
  history: string[] = [];

  constructor(distro: Distro) {
    this.distro = distro;
    this.sudoInstalled = distro === "ubuntu";
    for (const d of ["/", "/etc", "/etc/ssh", "/etc/ssh/sshd_config.d", "/etc/sudoers.d", "/home", "/root", "/tmp", "/usr", "/usr/bin", "/var", "/var/log"]) {
      this.fs.set(d, { kind: "dir", owner: "root", group: "root", mode: d === "/root" ? 0o700 : d === "/tmp" ? 0o777 : 0o755, content: "" });
    }
    this.fs.set("/etc/ssh/sshd_config", { kind: "file", owner: "root", group: "root", mode: 0o644, content: DEFAULT_SSHD });
    this.fs.set("/etc/hostname", { kind: "file", owner: "root", group: "root", mode: 0o644, content: `${HOSTNAME}\n` });
    this.fs.set("/etc/os-release", {
      kind: "file",
      owner: "root",
      group: "root",
      mode: 0o644,
      content: distro === "ubuntu" ? 'PRETTY_NAME="Ubuntu 24.04 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n' : 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n',
    });
    this.users.set("root", { name: "root", uid: 0, home: "/root", password: distro === "debian" ? "root" : null });
    this.groups.set("root", new Set(["root"]));
    this.groups.set("sudo", new Set());
    this.groups.set("users", new Set());
    this.createUser("schueler", "uebung");
    if (distro === "ubuntu") this.groups.get("sudo")!.add("schueler");
    this.activeSshd = this.effectiveSshd().values;
    this.sessions.push(this.newSession("schueler", false));
  }

  // -------------------------------------------------------------------------
  // Zustand für Aufgaben und Anzeige
  // -------------------------------------------------------------------------

  get session() {
    return this.sessions.at(-1)!;
  }

  promptText() {
    const s = this.session;
    const home = this.users.get(s.user)?.home ?? "/";
    const cwd = s.cwd === home ? "~" : s.cwd.startsWith(home + "/") ? "~" + s.cwd.slice(home.length) : s.cwd;
    return `${s.user}@${HOSTNAME}:${cwd}${s.user === "root" ? "#" : "$"} `;
  }

  node(path: string) {
    return this.fs.get(path);
  }
  hasUser(name: string) {
    return this.users.has(name);
  }
  inGroup(user: string, group: string) {
    return this.groups.get(group)?.has(user) ?? false;
  }
  homeOf(user: string) {
    return this.users.get(user)?.home;
  }

  /** Tab-Ergänzung: passende Befehle (erstes Wort) oder Pfade */
  complete(word: string, firstWord: boolean): string[] {
    if (firstWord && !word.includes("/")) return COMMANDS.filter((c) => c.startsWith(word));
    const slash = word.lastIndexOf("/");
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : "";
    const base = slash >= 0 ? word.slice(slash + 1) : word;
    const dir = this.resolve(dirPart || ".");
    if (!this.canEnter(this.session.user, dir) || !this.canRead(this.session.user, dir)) return [];
    return this.children(dir)
      .map((c) => c.split("/").pop()!)
      .filter((n) => n.startsWith(base) && (base.startsWith(".") || !n.startsWith(".")))
      .map((n) => dirPart + n + (this.fs.get(`${dir === "/" ? "" : dir}/${n}`)?.kind === "dir" ? "/" : ""));
  }

  // -------------------------------------------------------------------------
  // Dateisystem
  // -------------------------------------------------------------------------

  private resolve(p: string, cwd = this.sessions.at(-1)?.cwd ?? "/") {
    const home = this.users.get(this.sessions.at(-1)?.user ?? "root")?.home ?? "/";
    if (p === "~" || p.startsWith("~/")) p = home + p.slice(1);
    else if (/^~[a-z_][a-z0-9_-]*/.test(p)) {
      const [name, ...rest] = p.slice(1).split("/");
      p = (this.users.get(name!)?.home ?? `/home/${name}`) + (rest.length ? "/" + rest.join("/") : "");
    }
    const parts = (p.startsWith("/") ? p : `${cwd}/${p}`).split("/");
    const out: string[] = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return "/" + out.join("/");
  }

  private parentOf(path: string) {
    return path === "/" ? "/" : path.slice(0, path.lastIndexOf("/")) || "/";
  }

  private dynamicFile(path: string): string | null {
    if (path === "/etc/passwd")
      return [...this.users.values()].map((u) => `${u.name}:x:${u.uid}:${u.uid}::${u.home}:/bin/bash`).join("\n") + "\n";
    if (path === "/etc/group") {
      let gid = 0;
      return [...this.groups.entries()].map(([g, m]) => `${g}:x:${g === "root" ? 0 : (gid += 1) + 26}:${[...m].filter((u) => u !== g).join(",")}`).join("\n") + "\n";
    }
    if (path === "/etc/shadow") return [...this.users.values()].map((u) => `${u.name}:${u.password ? "$y$j9T$…" : "!"}:19700:0:99999:7:::`).join("\n") + "\n";
    return null;
  }

  private canRead(user: string, path: string) {
    if (user === "root") return true;
    if (path === "/etc/shadow") return false;
    const n = this.fs.get(path);
    if (!n) return true;
    const bits = n.owner === user ? n.mode >> 6 : this.inGroup(user, n.group) ? (n.mode >> 3) & 7 : n.mode & 7;
    return (bits & 4) !== 0;
  }

  private canWrite(user: string, path: string) {
    if (user === "root") return true;
    const n = this.fs.get(path);
    if (n) return n.owner === user && (n.mode & 0o200) !== 0;
    const parent = this.fs.get(this.parentOf(path));
    return Boolean(parent && (parent.mode === 0o777 || (parent.owner === user && (parent.mode & 0o200) !== 0)));
  }

  private canEnter(user: string, dir: string) {
    if (user === "root") return true;
    // Jeder Pfadbestandteil braucht das x-Recht
    let p = "";
    for (const part of dir.split("/").filter(Boolean)) {
      p += "/" + part;
      const n = this.fs.get(p);
      if (!n) return true;
      const bits = n.owner === user ? n.mode >> 6 : this.inGroup(user, n.group) ? (n.mode >> 3) & 7 : n.mode & 7;
      if ((bits & 1) === 0) return false;
    }
    return true;
  }

  private readFile(user: string, path: string): { content?: string; error?: string } {
    const dyn = this.dynamicFile(path);
    if (dyn !== null) return this.canRead(user, path) ? { content: dyn } : { error: "Keine Berechtigung" };
    const n = this.fs.get(path);
    if (!n || !this.canEnter(user, this.parentOf(path))) return { error: n ? "Keine Berechtigung" : "Datei oder Verzeichnis nicht gefunden" };
    if (n.kind === "dir") return { error: "Ist ein Verzeichnis" };
    if (!this.canRead(user, path)) return { error: "Keine Berechtigung" };
    return { content: n.content };
  }

  private writeFile(user: string, path: string, content: string, append: boolean): string | null {
    if (this.dynamicFile(path) !== null) return user === "root" ? "Bitte nutze adduser/usermod statt die Datei direkt zu ändern." : "Keine Berechtigung";
    const parent = this.fs.get(this.parentOf(path));
    if (!parent || parent.kind !== "dir") return "Datei oder Verzeichnis nicht gefunden";
    const n = this.fs.get(path);
    if (n?.kind === "dir") return "Ist ein Verzeichnis";
    if (!this.canEnter(user, this.parentOf(path)) || !this.canWrite(user, path)) return "Keine Berechtigung";
    if (n) n.content = append ? n.content + content : content;
    else this.fs.set(path, { kind: "file", owner: user, group: this.primaryGroup(user), mode: 0o644 & ~0o022, content });
    return null;
  }

  private primaryGroup(user: string) {
    return this.groups.has(user) ? user : "users";
  }

  private mkdir(user: string, path: string, mode = 0o755) {
    this.fs.set(path, { kind: "dir", owner: user, group: this.primaryGroup(user), mode, content: "" });
  }

  private children(dir: string) {
    const prefix = dir === "/" ? "/" : dir + "/";
    return [...this.fs.keys()].filter((p) => p !== dir && p.startsWith(prefix) && !p.slice(prefix.length).includes("/")).sort();
  }

  // -------------------------------------------------------------------------
  // Benutzer
  // -------------------------------------------------------------------------

  private createUser(name: string, password: string | null, makeHome = true) {
    const uid = 1000 + [...this.users.values()].filter((u) => u.uid >= 1000).length;
    this.users.set(name, { name, uid, home: `/home/${name}`, password });
    this.groups.set(name, new Set([name]));
    this.groups.get("users")!.add(name);
    if (makeHome) {
      this.fs.set(`/home/${name}`, { kind: "dir", owner: name, group: name, mode: 0o750, content: "" });
      this.fs.set(`/home/${name}/.bashrc`, { kind: "file", owner: name, group: name, mode: 0o644, content: "# ~/.bashrc\n" });
    }
  }

  private newSession(user: string, viaSsh: boolean): Session {
    const groups = new Set([...this.groups.entries()].filter(([, m]) => m.has(user)).map(([g]) => g));
    return { user, cwd: this.users.get(user)?.home ?? "/", groups, sudoUntil: 0, viaSsh };
  }

  // -------------------------------------------------------------------------
  // sshd
  // -------------------------------------------------------------------------

  /** Liest sshd_config samt Drop-ins. Wie bei OpenSSH gilt der erste gefundene Wert. */
  effectiveSshd() {
    const values = new Map<string, string>();
    const errors: string[] = [];
    const visit = (path: string, depth: number) => {
      const n = this.fs.get(path);
      if (!n || n.kind !== "file" || depth > 3) return;
      n.content.split("\n").forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line.startsWith("#")) return;
        const [key, ...rest] = line.split(/\s+/);
        const k = key!.toLowerCase();
        if (!SSHD_KEYWORDS.has(k)) {
          errors.push(`${path}: line ${i + 1}: Bad configuration option: ${key}`);
          return;
        }
        const value = rest.join(" ");
        if (k === "include") {
          const pattern = this.resolve(value, "/etc/ssh");
          const dir = this.parentOf(pattern);
          const suffix = pattern.slice(pattern.lastIndexOf("*") + 1);
          if (pattern.includes("*")) for (const c of this.children(dir).filter((c) => c.endsWith(suffix))) visit(c, depth + 1);
          else visit(pattern, depth + 1);
          return;
        }
        if (!value) errors.push(`${path}: line ${i + 1}: missing argument.`);
        if (["permitrootlogin"].includes(k) && !["yes", "no", "prohibit-password", "without-password", "forced-commands-only"].includes(value))
          errors.push(`${path} line ${i + 1}: unsupported option "${value}".`);
        if (["passwordauthentication", "pubkeyauthentication", "permitemptypasswords", "usepam", "x11forwarding"].includes(k) && !["yes", "no"].includes(value))
          errors.push(`${path} line ${i + 1}: unsupported option "${value}".`);
        if (!values.has(k)) values.set(k, value);
      });
    };
    visit("/etc/ssh/sshd_config", 0);
    return { values, errors };
  }

  sshdSetting(key: string, source: "active" | "file" = "active") {
    const map = source === "active" ? this.activeSshd : this.effectiveSshd().values;
    const v = map.get(key.toLowerCase());
    if (v) return v;
    return { permitrootlogin: "prohibit-password", passwordauthentication: "yes", pubkeyauthentication: "yes" }[key.toLowerCase()] ?? "";
  }

  // -------------------------------------------------------------------------
  // Ausführen
  // -------------------------------------------------------------------------

  async exec(line: string): Promise<Result> {
    const trimmed = line.trim();
    if (!trimmed) return ok();
    this.history.push(trimmed);
    let tokens: Token[];
    try {
      tokens = tokenize(trimmed);
    } catch (e) {
      return ok(`bash: ${(e as Error).message}`);
    }
    return this.runChain(splitChain(tokens), 0);
  }

  private async runChain(chain: { cmd: Token[]; op: string | null }[], i: number, prevOk = true): Promise<Result> {
    const out: string[] = [];
    for (; i < chain.length; i++) {
      const { cmd } = chain[i]!;
      const prev = chain[i - 1]?.op;
      if ((prev === "&&" && !prevOk) || (prev === "||" && prevOk)) continue;
      const r = await this.runPipeline(cmd, this.session.user);
      if (r.ask) {
        // Interaktive Rückfrage: Rest der Kette nach der Antwort ausführen
        const rest = i + 1;
        const prefix = [...out, r.out].filter(Boolean).join("\n");
        return { out: prefix, ask: this.continueAfter(r.ask, chain, rest) };
      }
      out.push(r.out);
      prevOk = !r.failed;
    }
    return ok(out.filter(Boolean).join("\n"));
  }

  private continueAfter(ask: Ask, chain: { cmd: Token[]; op: string | null }[], rest: number): Ask {
    return {
      ...ask,
      answer: async (input) => {
        const r = await ask.answer(input);
        if (r.ask) return { out: r.out, ask: this.continueAfter(r.ask, chain, rest) };
        if (rest >= chain.length) return r;
        const more = await this.runChain(chain, rest, !(r as RunResult).failed);
        return { out: [r.out, more.out].filter(Boolean).join("\n"), ask: more.ask };
      },
    };
  }

  private async runPipeline(tokens: Token[], user: string): Promise<RunResult> {
    const stages: Token[][] = [[]];
    for (const t of tokens) {
      if (t.op === "|") stages.push([]);
      else stages.at(-1)!.push(t);
    }
    let input: string | null = null;
    let last: RunResult = { out: "" };
    for (const stage of stages) {
      last = await this.runSimple(stage, user, input);
      if (last.ask) return last;
      input = last.out ? last.out + "\n" : "";
    }
    return last;
  }

  private async runSimple(tokens: Token[], user: string, stdin: string | null): Promise<RunResult> {
    const words: string[] = [];
    let redirect: { path: string; append: boolean } | null = null;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.op === ">" || t.op === ">>") {
        const target = tokens[++i];
        if (!target || target.op) return fail("bash: Syntaxfehler beim unerwarteten Symbol");
        redirect = { path: target.word!, append: t.op === ">>" };
      } else words.push(t.word!);
    }
    if (!words.length) return ok();
    const r = await this.command(words[0]!, words.slice(1), user, stdin);
    if (redirect && !r.ask) {
      const path = this.resolve(redirect.path);
      const err = this.writeFile(user, path, r.out ? r.out + "\n" : "", redirect.append);
      if (err) return fail(`bash: ${redirect.path}: ${err}`);
      return { out: "", failed: r.failed };
    }
    return r;
  }

  private async command(name: string, args: string[], user: string, stdin: string | null): Promise<RunResult> {
    const s = this.session;
    switch (name) {
      case "help":
        return ok(HELP);
      case "clear":
        return ok("\x1b[2J\x1b[H");
      case "whoami":
        return ok(user);
      case "hostname":
        return ok(HOSTNAME);
      case "uname":
        return ok(args.includes("-a") ? `Linux ${HOSTNAME} 6.8.0 #1 SMP x86_64 GNU/Linux` : "Linux");
      case "pwd":
        return ok(s.cwd);
      case "history":
        return ok(this.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join("\n"));
      case "id":
      case "groups": {
        const who = args[0] ?? user;
        const u = this.users.get(who);
        if (!u) return fail(`${name}: '${who}': Benutzer nicht gefunden`);
        // Ohne Argument zeigt id die Gruppen der laufenden Sitzung, nicht die aktuellen Einträge
        const gs = !args[0] && who === s.user ? [...s.groups] : [...this.groups.entries()].filter(([, m]) => m.has(who)).map(([g]) => g);
        if (name === "groups") return ok(args[0] ? `${who} : ${gs.join(" ")}` : gs.join(" "));
        return ok(`uid=${u.uid}(${who}) gid=${u.uid}(${who}) Gruppen=${gs.map((g) => g).join(",")}`);
      }
      case "echo":
        return ok(args.filter((a) => a !== "-e").join(" "));
      case "cd": {
        const target = this.resolve(args[0] ?? "~");
        const n = this.fs.get(target);
        if (!n) return fail(`bash: cd: ${args[0]}: Datei oder Verzeichnis nicht gefunden`);
        if (n.kind !== "dir") return fail(`bash: cd: ${args[0]}: Ist kein Verzeichnis`);
        if (!this.canEnter(user, target)) return fail(`bash: cd: ${args[0]}: Keine Berechtigung`);
        s.cwd = target;
        return ok();
      }
      case "ls":
        return this.ls(args, user);
      case "cat": {
        if (!args.length) return ok(stdin ?? "");
        const out: string[] = [];
        for (const a of args) {
          const r = this.readFile(user, this.resolve(a));
          if (r.error) return fail([...out, `cat: ${a}: ${r.error}`].join(""));
          out.push(r.content!);
        }
        return ok(out.join("").replace(/\n$/, ""));
      }
      case "grep": {
        const flags = args.filter((a) => a.startsWith("-"));
        const [pattern, file] = args.filter((a) => !a.startsWith("-"));
        if (!pattern) return fail("Aufruf: grep MUSTER [DATEI]");
        let text = stdin ?? "";
        if (file) {
          const r = this.readFile(user, this.resolve(file));
          if (r.error) return fail(`grep: ${file}: ${r.error}`);
          text = r.content!;
        }
        const ci = flags.some((f) => f.includes("i"));
        const lines = text.split("\n").filter((l) => (ci ? l.toLowerCase().includes(pattern.toLowerCase()) : l.includes(pattern)));
        return lines.length ? ok(lines.join("\n")) : { out: "", failed: true };
      }
      case "tee": {
        const append = args.includes("-a");
        const file = args.find((a) => !a.startsWith("-"));
        if (!file) return ok(stdin ?? "");
        const err = this.writeFile(user, this.resolve(file), stdin ?? "", append);
        if (err) return fail(`tee: ${file}: ${err}`);
        return ok((stdin ?? "").replace(/\n$/, ""));
      }
      case "touch": {
        for (const a of args) {
          const p = this.resolve(a);
          if (this.fs.has(p)) continue;
          const err = this.writeFile(user, p, "", false);
          if (err) return fail(`touch: '${a}' kann nicht berührt werden: ${err}`);
        }
        return ok();
      }
      case "mkdir": {
        const parents = args.includes("-p");
        const modeArg = args.indexOf("-m");
        const mode = modeArg >= 0 ? parseInt(args[modeArg + 1] ?? "755", 8) : 0o755;
        const dirs = args.filter((x, i) => !x.startsWith("-") && (modeArg < 0 || i !== modeArg + 1));
        for (const a of dirs) {
          const p = this.resolve(a);
          if (this.fs.has(p)) {
            if (parents) continue;
            return fail(`mkdir: das Verzeichnis „${a}“ kann nicht angelegt werden: Die Datei existiert bereits`);
          }
          const missing: string[] = [];
          let cur = p;
          while (!this.fs.has(cur)) {
            missing.unshift(cur);
            cur = this.parentOf(cur);
          }
          if (missing.length > 1 && !parents) return fail(`mkdir: das Verzeichnis „${a}“ kann nicht angelegt werden: Datei oder Verzeichnis nicht gefunden`);
          for (const m of missing) {
            if (!this.canWrite(user, m)) return fail(`mkdir: das Verzeichnis „${a}“ kann nicht angelegt werden: Keine Berechtigung`);
            this.mkdir(user, m, mode);
          }
        }
        return ok();
      }
      case "rm": {
        const recursive = args.some((a) => /^-[a-z]*r/i.test(a));
        for (const a of args.filter((x) => !x.startsWith("-"))) {
          const p = this.resolve(a);
          const n = this.fs.get(p);
          if (!n) return fail(`rm: '${a}' kann nicht entfernt werden: Datei oder Verzeichnis nicht gefunden`);
          if (n.kind === "dir" && !recursive) return fail(`rm: '${a}' kann nicht entfernt werden: Ist ein Verzeichnis`);
          if (user !== "root" && !this.canWrite(user, this.parentOf(p)) && n.owner !== user) return fail(`rm: '${a}' kann nicht entfernt werden: Keine Berechtigung`);
          for (const k of [...this.fs.keys()]) if (k === p || k.startsWith(p + "/")) this.fs.delete(k);
        }
        return ok();
      }
      case "cp":
      case "mv": {
        const [src, dst] = args.filter((a) => !a.startsWith("-"));
        if (!src || !dst) return fail(`${name}: Dateioperand fehlt`);
        const from = this.resolve(src);
        const r = this.readFile(user, from);
        if (r.error) return fail(`${name}: '${src}': ${r.error}`);
        let to = this.resolve(dst);
        if (this.fs.get(to)?.kind === "dir") to = `${to}/${from.split("/").pop()}`;
        const err = this.writeFile(user, to, r.content!, false);
        if (err) return fail(`${name}: '${dst}': ${err}`);
        const fromNode = this.fs.get(from)!;
        if (name === "mv") {
          this.fs.get(to)!.mode = fromNode.mode;
          this.fs.delete(from);
        }
        return ok();
      }
      case "chmod":
        return this.chmod(args, user);
      case "chown":
        return this.chown(args, user);
      case "nano":
      case "vim":
      case "vi":
      case "visudo":
        return fail(
          `${name}: Editoren gibt es im Übungsterminal nicht. Schreibe Dateien mit echo, zum Beispiel:\n  echo "PasswordAuthentication no" | sudo tee /etc/ssh/sshd_config.d/10-haertung.conf`,
        );
      case "ssh-keygen":
        return this.sshKeygen(args, user);
      case "ssh-copy-id":
        return this.sshCopyId(args, user);
      case "ssh":
        return this.ssh(args, user);
      case "adduser":
      case "useradd":
        return this.addUser(name, args, user);
      case "usermod":
        return this.usermod(args, user);
      case "deluser":
      case "userdel": {
        if (user !== "root") return fail(`${name}: Nur root darf Benutzer löschen.`);
        const who = args.find((a) => !a.startsWith("-"));
        if (!who || !this.users.has(who) || who === "root") return fail(`${name}: Benutzer '${who ?? ""}' existiert nicht`);
        this.users.delete(who);
        for (const m of this.groups.values()) m.delete(who);
        this.groups.delete(who);
        if (args.includes("--remove-home") || args.includes("-r")) for (const k of [...this.fs.keys()]) if (k === `/home/${who}` || k.startsWith(`/home/${who}/`)) this.fs.delete(k);
        return ok(`Benutzer '${who}' wird entfernt …\nFertig.`);
      }
      case "gpasswd": {
        if (user !== "root") return fail("gpasswd: Keine Berechtigung.");
        const i = args.indexOf("-a");
        const [who, group] = i >= 0 ? [args[i + 1], args[i + 2]] : [];
        if (!who || !group) return fail("Aufruf: gpasswd -a BENUTZER GRUPPE");
        if (!this.users.has(who)) return fail(`gpasswd: Benutzer '${who}' existiert nicht`);
        if (!this.groups.has(group)) return fail(`gpasswd: Gruppe '${group}' existiert nicht`);
        this.groups.get(group)!.add(who);
        return ok(`Benutzer ${who} wird zur Gruppe ${group} hinzugefügt`);
      }
      case "passwd":
        return this.passwd(args, user);
      case "su":
        return this.su(args, user);
      case "sudo":
        return this.sudo(args, user, stdin);
      case "exit":
      case "logout": {
        if (this.sessions.length === 1) return ok("Das ist die erste Sitzung. Zum Neustart der Übung nutze den Knopf „Zurücksetzen“.");
        const closed = this.sessions.pop()!;
        return ok(closed.viaSsh ? `logout\nConnection to localhost closed.` : "logout");
      }
      case "apt":
      case "apt-get":
        return this.apt(args, user);
      case "sshd":
      case "/usr/sbin/sshd": {
        if (!args.includes("-t") && !args.includes("-T")) return fail("sshd läuft bereits als Dienst. Prüfen mit: sudo sshd -t");
        if (user !== "root") return fail("sshd: Konfiguration nur als root prüfbar (sudo sshd -t)");
        const { values, errors } = this.effectiveSshd();
        if (errors.length) return fail(errors.join("\n"));
        if (args.includes("-T")) {
          const keys = ["port", "permitrootlogin", "pubkeyauthentication", "passwordauthentication", "kbdinteractiveauthentication", "usepam", "allowusers", "trustedusercakeys"];
          return ok(keys.map((k) => `${k} ${values.get(k) ?? this.sshdSetting(k, "file") ?? ""}`.trim()).filter((l) => l.includes(" ")).join("\n"));
        }
        return ok();
      }
      case "systemctl":
      case "service":
        return this.systemctl(name === "service" ? [args[1] ?? "", args[0] ?? ""] : args, user);
      default:
        return fail(`${name}: Befehl nicht gefunden. „help“ zeigt, was das Übungsterminal kann.`);
    }
  }

  private ls(args: string[], user: string): RunResult {
    const flags = args.filter((a) => a.startsWith("-")).join("");
    const long = flags.includes("l");
    const all = flags.includes("a");
    const targets = args.filter((a) => !a.startsWith("-"));
    const out: string[] = [];
    for (const t of targets.length ? targets : ["."]) {
      const p = this.resolve(t);
      const n = this.fs.get(p) ?? (this.dynamicFile(p) !== null ? ({ kind: "file", owner: "root", group: "root", mode: p === "/etc/shadow" ? 0o640 : 0o644, content: this.dynamicFile(p)! } as Node) : undefined);
      if (!n) return fail(`ls: Zugriff auf '${t}' nicht möglich: Datei oder Verzeichnis nicht gefunden`);
      if (n.kind === "dir" && (!this.canRead(user, p) || !this.canEnter(user, p))) return fail(`ls: Verzeichnis '${t}' kann nicht geöffnet werden: Keine Berechtigung`);
      let entries: [string, Node][] =
        n.kind === "dir" ? this.children(p).map((c) => [c.split("/").pop()!, this.fs.get(c)!]) : [[t, n]];
      if (p === "/etc" && n.kind === "dir") for (const f of ["passwd", "group", "shadow"]) entries.push([f, { kind: "file", owner: "root", group: f === "shadow" ? "shadow" : "root", mode: f === "shadow" ? 0o640 : 0o644, content: this.dynamicFile(`/etc/${f}`)! }]);
      if (!all) entries = entries.filter(([name]) => !name.startsWith("."));
      else if (n.kind === "dir") entries = [[".", n], ["..", this.fs.get(this.parentOf(p))!], ...entries];
      entries.sort((a, b) => a[0].localeCompare(b[0]));
      if (targets.length > 1) out.push(`${t}:`);
      if (long) {
        out.push(`insgesamt ${entries.length * 4}`);
        for (const [name, e] of entries) {
          const size = e.kind === "dir" ? 4096 : e.content.length;
          out.push(`${modeString(e)} 1 ${e.owner.padEnd(8)} ${e.group.padEnd(8)} ${String(size).padStart(5)} ${colorName(name, e)}`);
        }
      } else out.push(entries.map(([name, e]) => colorName(name, e)).join("  "));
    }
    return ok(out.filter((l) => l !== "").join("\n"));
  }

  private chmod(args: string[], user: string): RunResult {
    const recursive = args.includes("-R");
    const rest = args.filter((a) => a !== "-R");
    const [modeArg, ...files] = rest;
    if (!modeArg || !files.length) return fail("Aufruf: chmod MODUS DATEI …  (z. B. chmod 600 ~/.ssh/authorized_keys)");
    for (const f of files) {
      const p = this.resolve(f);
      const n = this.fs.get(p);
      if (!n) return fail(`chmod: Zugriff auf '${f}' nicht möglich: Datei oder Verzeichnis nicht gefunden`);
      if (user !== "root" && n.owner !== user) return fail(`chmod: Ändern der Zugriffsrechte von '${f}': Die Operation ist nicht erlaubt`);
      const targets = recursive ? [...this.fs.entries()].filter(([k]) => k === p || k.startsWith(p + "/")) : [[p, n] as const];
      for (const [, node] of targets) {
        const m = applyMode(node.mode, modeArg, node.kind === "dir");
        if (m === null) return fail(`chmod: ungültiger Modus: „${modeArg}“`);
        node.mode = m;
      }
    }
    return ok();
  }

  private chown(args: string[], user: string): RunResult {
    const recursive = args.includes("-R");
    const [spec, ...files] = args.filter((a) => a !== "-R");
    if (!spec || !files.length) return fail("Aufruf: chown BENUTZER[:GRUPPE] DATEI …");
    if (user !== "root") return fail(`chown: Ändern des Eigentümers von '${files[0]}': Die Operation ist nicht erlaubt (nur root, also mit sudo)`);
    const [owner, group] = spec.split(":");
    if (owner && !this.users.has(owner)) return fail(`chown: ungültiger Benutzer: „${spec}“`);
    if (group && !this.groups.has(group)) return fail(`chown: ungültige Gruppe: „${spec}“`);
    for (const f of files) {
      const p = this.resolve(f);
      if (!this.fs.has(p)) return fail(`chown: Zugriff auf '${f}' nicht möglich: Datei oder Verzeichnis nicht gefunden`);
      for (const [k, node] of this.fs) {
        if (k !== p && !(recursive && k.startsWith(p + "/"))) continue;
        if (owner) node.owner = owner;
        if (group !== undefined) node.group = group || (owner ? this.primaryGroup(owner) : node.group);
      }
    }
    return ok();
  }

  private async sshKeygen(args: string[], user: string): Promise<RunResult> {
    const opt = (flag: string) => {
      const i = args.indexOf(flag);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const home = this.users.get(user)!.home;
    if (args.includes("-l") || args.includes("-lf")) {
      const file = opt("-f") ?? opt("-lf");
      if (!file) return fail("Aufruf: ssh-keygen -lf DATEI");
      const r = this.readFile(user, this.resolve(file));
      if (r.error) return fail(`${file}: ${r.error}`);
      const { parsePublicKey } = await import("@ssh-academy/ssh/keys");
      try {
        const k = await parsePublicKey(r.content!.split("\n")[0]!);
        return ok(`${k.bits} ${k.fingerprint} ${k.comment || "no comment"} (${k.type.toUpperCase()})`);
      } catch {
        return fail(`${file} ist keine Public-Key-Datei.`);
      }
    }
    const type = (opt("-t") ?? "ed25519") as SshKeyType;
    if (!["ed25519", "rsa", "ecdsa"].includes(type)) return fail(`unknown key type ${type}`);
    const comment = opt("-C") ?? `${user}@${HOSTNAME}`;
    const defaultFile = `${home}/.ssh/id_${type}`;
    const generate = async (file: string, passphrase: string): Promise<RunResult> => {
      const path = this.resolve(file);
      const dir = this.parentOf(path);
      if (!this.fs.has(dir)) {
        if (dir !== `${home}/.ssh`) return fail(`Saving key "${file}" failed: No such file or directory`);
        this.mkdir(user, dir, 0o700);
        if (user === "root") this.fs.get(dir)!.owner = "root";
      }
      const key = await generateSshKey(type, comment);
      const errPriv = this.writeFile(user, path, key.privateKey, false);
      if (errPriv) return fail(`Saving key "${file}" failed: ${errPriv}`);
      this.fs.get(path)!.mode = 0o600;
      this.writeFile(user, `${path}.pub`, key.publicKey + "\n", false);
      this.fs.get(`${path}.pub`)!.mode = 0o644;
      return ok(
        [
          `Your identification has been saved in ${path}${passphrase ? "" : "  (ohne Passphrase)"}`,
          `Your public key has been saved in ${path}.pub`,
          "The key fingerprint is:",
          `${key.fingerprint} ${comment}`,
        ].join("\n"),
      );
    };
    const askPassphrase = (file: string): Ask => ({
      prompt: "Enter passphrase (empty for no passphrase): ",
      secret: true,
      answer: (p1) => ({
        out: "",
        ask: {
          prompt: "Enter same passphrase again: ",
          secret: true,
          answer: (p2) => (p1 === p2 ? generate(file, p1) : fail("Passphrases do not match.  Try again.")),
        },
      }),
    });
    const withFile = (file: string): RunResult | Promise<RunResult> => {
      const path = this.resolve(file);
      const proceed = () => (opt("-N") !== undefined ? generate(file, opt("-N")!) : { out: "", ask: askPassphrase(file) });
      if (this.fs.has(path))
        return {
          out: `${path} already exists.`,
          ask: { prompt: "Overwrite (y/n)? ", answer: (a) => (a.trim().toLowerCase().startsWith("y") ? proceed() : ok()) },
        };
      return proceed();
    };
    const out = `Generating public/private ${type} key pair.`;
    const f = opt("-f");
    if (f) {
      const r = await withFile(f);
      return { ...r, out: [out, r.out].filter(Boolean).join("\n") };
    }
    return {
      out,
      ask: { prompt: `Enter file in which to save the key (${defaultFile}): `, answer: (a) => withFile(a.trim() || defaultFile) },
    };
  }

  /** Prüft, ob sich `from` mit seinem Key als `to` anmelden kann (inklusive StrictModes) */
  private keyLoginProblem(from: string, to: string): string | null {
    if (this.sshdSetting("PubkeyAuthentication") === "no") return "PubkeyAuthentication ist ausgeschaltet.";
    const toUser = this.users.get(to)!;
    const pubs = this.children(`${this.users.get(from)!.home}/.ssh`)
      .filter((p) => p.endsWith(".pub"))
      .map((p) => this.fs.get(p)!.content.trim().split(/\s+/).slice(0, 2).join(" "));
    if (!pubs.length) return "Du hast noch keinen Key (ssh-keygen).";
    const sshDir = this.fs.get(`${toUser.home}/.ssh`);
    const ak = this.fs.get(`${toUser.home}/.ssh/authorized_keys`);
    if (!sshDir || !ak) return `${toUser.home}/.ssh/authorized_keys fehlt.`;
    const lines = ak.content.split("\n").map((l) => l.trim().split(/\s+/).slice(0, 2).join(" "));
    if (!pubs.some((p) => lines.includes(p))) return "Dein Public Key steht nicht in authorized_keys.";
    // StrictModes: Home, .ssh und authorized_keys dürfen nicht für andere schreibbar sein und müssen dem Benutzer gehören
    const home = this.fs.get(toUser.home);
    for (const [label, n] of [[toUser.home, home], [`${toUser.home}/.ssh`, sshDir], [`${toUser.home}/.ssh/authorized_keys`, ak]] as const) {
      if (!n) continue;
      if (n.owner !== to && n.owner !== "root") return `Authentication refused: bad ownership or modes for ${label} (gehört ${n.owner}, nicht ${to})`;
      if (n.mode & 0o022) return `Authentication refused: bad ownership or modes for ${label} (Modus ${n.mode.toString(8)} ist für andere schreibbar)`;
    }
    return null;
  }

  private ssh(args: string[], user: string): RunResult {
    const target = args.find((a) => !a.startsWith("-"));
    if (!target) return fail("Aufruf: ssh BENUTZER@localhost");
    const [to, host] = target.includes("@") ? target.split("@") : [user, target];
    if (!["localhost", "127.0.0.1", HOSTNAME].includes(host!)) return fail(`ssh: Could not resolve hostname ${host}: Im Übungsterminal gibt es nur localhost.`);
    if (!to || !this.users.has(to)) return fail(`${to}@${host}: Permission denied (publickey).`);
    if (to === "root" && this.sshdSetting("PermitRootLogin") === "no") return fail(`${to}@${host}: Permission denied (publickey${this.sshdSetting("PasswordAuthentication") === "yes" ? ",password" : ""}).\n(Hinweis: PermitRootLogin no)`);
    const keyProblem = this.keyLoginProblem(user, to);
    const login = (method: string) => {
      this.logins.add(`${to}:${method}`);
      this.sessions.push(this.newSession(to, true));
      return ok(`Willkommen auf ${HOSTNAME} (${this.distro === "ubuntu" ? "Ubuntu 24.04 LTS" : "Debian 12"})\nAngemeldet als ${to} per ${method === "key" ? "SSH-Key" : "Passwort"}.`);
    };
    if (!keyProblem && !(to === "root" && this.sshdSetting("PermitRootLogin") === "forced-commands-only")) return login("key");
    const passwordAllowed = this.sshdSetting("PasswordAuthentication") === "yes" && !(to === "root" && this.sshdSetting("PermitRootLogin") !== "yes");
    if (!passwordAllowed || !this.users.get(to)!.password) {
      return fail(`${to}@${host}: Permission denied (publickey).\n(Grund für den Key: ${keyProblem})`);
    }
    return {
      out: "",
      ask: {
        prompt: `${to}@${host}'s password: `,
        secret: true,
        answer: (pw) => (pw === this.users.get(to)!.password ? login("password") : fail("Permission denied, please try again.")),
      },
    };
  }

  private sshCopyId(args: string[], user: string): RunResult {
    const iIdx = args.indexOf("-i");
    const keyFile = iIdx >= 0 ? this.resolve(args[iIdx + 1]!) : null;
    const target = args.filter((a, i) => !a.startsWith("-") && (iIdx < 0 || i !== iIdx + 1)).pop();
    if (!target) return fail("Aufruf: ssh-copy-id [-i ~/.ssh/id_ed25519.pub] BENUTZER@localhost");
    const [to, host] = target.includes("@") ? target.split("@") : [user, target];
    if (!["localhost", "127.0.0.1", HOSTNAME].includes(host!)) return fail(`ssh: Could not resolve hostname ${host}`);
    const pubPath = keyFile ? (keyFile.endsWith(".pub") ? keyFile : `${keyFile}.pub`) : this.children(`${this.users.get(user)!.home}/.ssh`).find((p) => p.endsWith(".pub"));
    const pub = pubPath ? this.fs.get(pubPath)?.content.trim() : undefined;
    if (!pub) return fail("/usr/bin/ssh-copy-id: ERROR: No identities found (erst ssh-keygen ausführen)");
    if (!to || !this.users.has(to)) return fail(`${to}@${host}: Permission denied`);
    const toUser = this.users.get(to)!;
    const install = () => {
      const dir = `${toUser.home}/.ssh`;
      if (!this.fs.has(dir)) this.fs.set(dir, { kind: "dir", owner: to, group: this.primaryGroup(to), mode: 0o700, content: "" });
      const ak = this.fs.get(`${dir}/authorized_keys`);
      if (ak?.content.includes(pub.split(/\s+/)[1]!)) return ok("/usr/bin/ssh-copy-id: WARNING: All keys were skipped because they already exist on the remote system.");
      if (ak) ak.content += (ak.content.endsWith("\n") || !ak.content ? "" : "\n") + pub + "\n";
      else this.fs.set(`${dir}/authorized_keys`, { kind: "file", owner: to, group: this.primaryGroup(to), mode: 0o600, content: pub + "\n" });
      return ok(`Number of key(s) added: 1\n\nNow try logging into the machine, with:   "ssh '${to}@${host}'"`);
    };
    if (!this.keyLoginProblem(user, to)) return install();
    if (this.sshdSetting("PasswordAuthentication") !== "yes" || !toUser.password)
      return fail(`${to}@${host}: Permission denied (publickey).\nPasswort-Login ist aus oder ${to} hat kein Passwort. Trage den Key dann als root ein (sudo …).`);
    return {
      out: `/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: "${pubPath}"`,
      ask: { prompt: `${to}@${host}'s password: `, secret: true, answer: (pw) => (pw === toUser.password ? install() : fail("Permission denied, please try again.")) },
    };
  }

  private addUser(cmd: string, args: string[], user: string): RunResult {
    if (user !== "root") return fail(`${cmd}: Nur root darf Benutzer anlegen. Versuche: sudo ${cmd} ${args.join(" ")}`);
    const name = args.filter((a) => !a.startsWith("-")).pop();
    if (!name || !/^[a-z_][a-z0-9_-]{0,31}$/.test(name)) return fail(`${cmd}: Bitte einen gültigen Benutzernamen angeben (Kleinbuchstaben, Ziffern, - und _).`);
    if (this.users.has(name)) return fail(`${cmd}: Der Benutzer „${name}“ existiert bereits.`);
    if (cmd === "useradd") {
      this.createUser(name, null, args.includes("-m"));
      const g = args.indexOf("-G");
      if (g >= 0) for (const grp of (args[g + 1] ?? "").split(",")) this.groups.get(grp)?.add(name);
      return ok(args.includes("-m") ? "" : `(Hinweis: ohne -m wurde kein Home-Verzeichnis angelegt. adduser macht das automatisch.)`);
    }
    const out = [`Benutzer »${name}« wird hinzugefügt …`, `Neue Gruppe »${name}« wird hinzugefügt …`, `Home-Verzeichnis »/home/${name}« wird erstellt …`].join("\n");
    return {
      out,
      ask: {
        prompt: "Neues Passwort: ",
        secret: true,
        answer: (p1) => ({
          out: "",
          ask: {
            prompt: "Geben Sie das neue Passwort erneut ein: ",
            secret: true,
            answer: (p2) => {
              if (p1 !== p2 || !p1) return fail("passwd: Die Passwörter stimmen nicht überein. Benutzer wurde nicht angelegt.");
              this.createUser(name, p1);
              return ok(`passwd: Passwort erfolgreich geändert\nBenutzer ${name} angelegt.`);
            },
          },
        }),
      },
    };
  }

  private usermod(args: string[], user: string): RunResult {
    if (user !== "root") return fail("usermod: Keine Berechtigung. Versuche es mit sudo.");
    const name = args.at(-1);
    const gIdx = args.findIndex((a) => a === "-aG" || a === "-G" || a === "-a");
    if (!name || !this.users.has(name)) return fail(`usermod: Benutzer „${name ?? ""}“ existiert nicht`);
    if (gIdx < 0) return fail("Aufruf: usermod -aG GRUPPE BENUTZER");
    const append = args.includes("-aG") || args.includes("-a");
    const groupArg = args[args.indexOf(args.includes("-G") ? "-G" : "-aG") + 1];
    if (!groupArg) return fail("usermod: Gruppe fehlt");
    const wanted = groupArg.split(",");
    for (const g of wanted) if (!this.groups.has(g)) return fail(`usermod: Gruppe „${g}“ existiert nicht`);
    if (!append) {
      // -G ohne -a ersetzt alle Zusatzgruppen: ein klassischer Fehler, den wir zeigen
      for (const [g, m] of this.groups) if (g !== name && !wanted.includes(g)) m.delete(name);
    }
    for (const g of wanted) this.groups.get(g)!.add(name);
    return ok(append ? "" : "Achtung: -G ohne -a ersetzt alle bisherigen Zusatzgruppen.");
  }

  private passwd(args: string[], user: string): RunResult {
    const who = args.find((a) => !a.startsWith("-")) ?? user;
    if (who !== user && user !== "root") return fail(`passwd: Sie dürfen das Passwort für ${who} nicht anzeigen oder ändern.`);
    if (!this.users.has(who)) return fail(`passwd: Benutzer '${who}' existiert nicht`);
    if (args.includes("-l")) {
      this.users.get(who)!.password = null;
      return ok(`passwd: Passwort-Ablaufdaten geändert. (Passwort von ${who} gesperrt)`);
    }
    return {
      out: "",
      ask: {
        prompt: "Neues Passwort: ",
        secret: true,
        answer: (p1) => ({
          out: "",
          ask: {
            prompt: "Geben Sie das neue Passwort erneut ein: ",
            secret: true,
            answer: (p2) => {
              if (!p1 || p1 !== p2) return fail("passwd: Die Passwörter stimmen nicht überein.");
              this.users.get(who)!.password = p1;
              return ok("passwd: Passwort erfolgreich geändert");
            },
          },
        }),
      },
    };
  }

  private su(args: string[], user: string): RunResult {
    const target = args.filter((a) => a !== "-" && a !== "-l").pop() ?? "root";
    const u = this.users.get(target);
    if (!u) return fail(`su: Benutzer ${target} existiert nicht`);
    const enter = () => {
      this.sessions.push(this.newSession(target, false));
      return ok();
    };
    if (user === "root") return enter();
    if (!u.password) return fail(`su: Authentifizierung fehlgeschlagen${target === "root" ? "\n(root hat auf Ubuntu kein Passwort. Nutze sudo -i.)" : ""}`);
    return { out: "", ask: { prompt: "Passwort: ", secret: true, answer: (pw) => (pw === u.password ? enter() : fail("su: Authentifizierung fehlgeschlagen")) } };
  }

  private async sudo(args: string[], user: string, stdin: string | null): Promise<RunResult> {
    if (!this.sudoInstalled) return fail("bash: sudo: Befehl nicht gefunden\n(Auf Debian ist sudo oft nicht installiert. Werde mit „su -“ root und installiere es: apt install sudo)");
    if (!args.length) return fail("Aufruf: sudo BEFEHL  oder  sudo -i");
    const s = this.session;
    const run = async (): Promise<RunResult> => {
      s.sudoUntil = Date.now() + 15 * 60_000;
      if (args[0] === "-i" || args[0] === "-s" || (args[0] === "su" && (args[1] === "-" || !args[1]))) {
        this.sessions.push(this.newSession("root", false));
        return ok();
      }
      // Umleitungen (>, >>) hat schon die aufrufende Shell als normaler Benutzer ausgewertet, wie in bash.
      // Deshalb klappt "echo x | sudo tee datei", aber nicht "sudo echo x > datei".
      return this.command(args[0]!, args.slice(1), "root", stdin);
    };
    if (user === "root") return run();
    // sudo prüft die Gruppen der laufenden Sitzung: Neue Gruppen gelten erst nach neuer Anmeldung
    if (!s.groups.has("sudo")) {
      const pending = this.inGroup(user, "sudo") ? "\n(Du bist inzwischen in der Gruppe sudo, aber erst nach einer neuen Anmeldung. Tipp: exit und neu anmelden, z. B. mit su - " + user + ")" : "";
      return fail(`${user} ist nicht in der sudoers-Datei. Dieser Vorfall wird gemeldet.${pending}`);
    }
    if (s.sudoUntil > Date.now()) return run();
    const pw = this.users.get(user)!.password;
    return {
      out: "",
      ask: { prompt: `[sudo] Passwort für ${user}: `, secret: true, answer: (input) => (input === pw ? run() : fail("Sorry, try again.\nsudo: 1 incorrect password attempt")) },
    };
  }

  private apt(args: string[], user: string): RunResult {
    if (args[0] !== "install" && args[0] !== "update") return fail("Im Übungsterminal kann apt nur „update“ und „install sudo“.");
    if (user !== "root") return fail("E: Sperrdatei /var/lib/dpkg/lock-frontend konnte nicht geöffnet werden - open (13: Keine Berechtigung)\nE: Sind Sie root?");
    if (args[0] === "update") return ok("Paketlisten werden gelesen … Fertig");
    const pkgs = args.slice(1).filter((a) => !a.startsWith("-"));
    if (pkgs.some((p) => p !== "sudo" && p !== "openssh-server")) return fail("Im Übungsterminal gibt es nur die Pakete sudo und openssh-server.");
    if (pkgs.includes("sudo")) {
      if (this.sudoInstalled) return ok("sudo ist schon die neueste Version.");
      this.sudoInstalled = true;
      return ok("Paketlisten werden gelesen … Fertig\nsudo wird eingerichtet …\nFertig. Füge jetzt Benutzer zur Gruppe sudo hinzu: usermod -aG sudo BENUTZER");
    }
    return ok("openssh-server ist schon die neueste Version.");
  }

  private systemctl(args: string[], user: string): RunResult {
    const [action, unit] = args;
    if (!unit || !["ssh", "sshd", "ssh.service", "sshd.service"].includes(unit)) return fail("Im Übungsterminal gibt es nur den Dienst ssh.");
    if (action === "status") {
      const port = this.sshdSetting("Port") || "22";
      return ok(`● ssh.service - OpenBSD Secure Shell server\n     Active: active (running)\n   Listening on 0.0.0.0 port ${port}.`);
    }
    if (!["reload", "restart"].includes(action ?? "")) return fail("Aufruf: systemctl reload ssh | systemctl status ssh");
    if (user !== "root") return fail("Failed to reload ssh.service: Interactive authentication required. (sudo vergessen?)");
    const { values, errors } = this.effectiveSshd();
    if (errors.length) {
      return fail(
        action === "restart"
          ? `Job for ssh.service failed. sshd startet wegen eines Fehlers nicht!\n${errors.join("\n")}\n(Deshalb vorher immer: sudo sshd -t)`
          : `ssh.service: Reload abgelehnt, die Konfiguration ist fehlerhaft:\n${errors.join("\n")}\nDie alte Konfiguration bleibt aktiv.`,
      );
    }
    this.activeSshd = values;
    return ok();
  }
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

type RunResult = Result & { failed?: boolean };
type Token = { word?: string; op?: string };

function fail(out: string): RunResult {
  return { out, failed: true };
}

export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let cur = "";
  let has = false;
  let quote: string | null = null;
  const push = () => {
    if (has) tokens.push({ word: cur });
    cur = "";
    has = false;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === "\\" && i + 1 < line.length) {
      cur += line[++i];
      has = true;
    } else if (/\s/.test(c)) push();
    else if (c === ">" || c === "|" || c === "&" || c === ";") {
      push();
      const two = line.slice(i, i + 2);
      if (two === ">>" || two === "&&" || two === "||") {
        tokens.push({ op: two });
        i++;
      } else if (c === "&") throw new Error("Hintergrundprozesse (&) gibt es im Übungsterminal nicht");
      else tokens.push({ op: c });
    } else if (c === "#" && !has) break;
    else {
      cur += c;
      has = true;
    }
  }
  if (quote) throw new Error("Anführungszeichen nicht geschlossen");
  push();
  return tokens;
}

function splitChain(tokens: Token[]) {
  const chain: { cmd: Token[]; op: string | null }[] = [{ cmd: [], op: null }];
  for (const t of tokens) {
    if (t.op === "&&" || t.op === ";" || t.op === "||") {
      chain.at(-1)!.op = t.op;
      chain.push({ cmd: [], op: null });
    } else chain.at(-1)!.cmd.push(t);
  }
  return chain.filter((c) => c.cmd.length);
}

function modeString(n: Node) {
  const r = (b: number) => `${b & 4 ? "r" : "-"}${b & 2 ? "w" : "-"}${b & 1 ? "x" : "-"}`;
  return `${n.kind === "dir" ? "d" : "-"}${r(n.mode >> 6)}${r((n.mode >> 3) & 7)}${r(n.mode & 7)}`;
}

function colorName(name: string, n: Node) {
  return n.kind === "dir" ? `\x1b[1;34m${name}\x1b[0m` : name;
}

/** chmod-Modus anwenden: oktal (600) oder symbolisch (u+x, go-rwx, a=r) */
export function applyMode(current: number, spec: string, isDir: boolean): number | null {
  if (/^[0-7]{3,4}$/.test(spec)) return parseInt(spec, 8) & 0o777;
  let mode = current;
  for (const part of spec.split(",")) {
    const m = /^([ugoa]*)([+\-=])([rwxX]*)$/.exec(part);
    if (!m) return null;
    const who = m[1] || "a";
    let bits = 0;
    for (const c of m[3]!) bits |= c === "r" ? 4 : c === "w" ? 2 : c === "x" || (c === "X" && isDir) ? 1 : 0;
    let mask = 0;
    if (who.includes("u") || who.includes("a")) mask |= bits << 6;
    if (who.includes("g") || who.includes("a")) mask |= bits << 3;
    if (who.includes("o") || who.includes("a")) mask |= bits;
    const whoMask = (who.includes("u") || who.includes("a") ? 0o700 : 0) | (who.includes("g") || who.includes("a") ? 0o070 : 0) | (who.includes("o") || who.includes("a") ? 0o007 : 0);
    if (m[2] === "+") mode |= mask;
    else if (m[2] === "-") mode &= ~mask;
    else mode = (mode & ~whoMask) | mask;
  }
  return mode;
}

const COMMANDS = [
  "adduser", "apt", "cat", "cd", "chmod", "chown", "clear", "cp", "deluser", "echo", "exit", "gpasswd", "grep", "groups", "help", "history",
  "hostname", "id", "ls", "mkdir", "mv", "passwd", "pwd", "rm", "ssh", "ssh-copy-id", "ssh-keygen", "sshd", "su", "sudo", "systemctl", "tee",
  "touch", "uname", "useradd", "userdel", "usermod", "whoami",
];

const HELP = `Das Übungsterminal simuliert einen Linux-Server. Verfügbare Befehle:

  Dateien     ls [-la], cd, pwd, cat, echo … > datei, tee [-a], touch, mkdir [-p], rm [-r], cp, mv, grep
  Rechte      chmod 600 datei, chmod u+x datei, chown benutzer:gruppe datei [-R]
  Benutzer    whoami, id, groups, adduser, useradd -m, usermod -aG gruppe benutzer, passwd, deluser
  Wechseln    su - [benutzer], sudo befehl, sudo -i, exit
  SSH         ssh-keygen [-t ed25519] [-C kommentar] [-f datei], ssh-keygen -lf datei.pub,
              ssh-copy-id benutzer@localhost, ssh benutzer@localhost
  sshd        sudo sshd -t, sudo sshd -T, sudo systemctl reload ssh, systemctl status ssh
  Pakete      apt install sudo (nur auf Debian nötig)

Pipes (|), Umleitungen (>, >>) und Ketten (&&, ;) funktionieren. Pfeiltasten holen alte Befehle zurück, Tab ergänzt.`;
