"use client";
import "@xterm/xterm/css/xterm.css";
import type { Terminal } from "@xterm/xterm";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { aufgabenFuer } from "@/lib/uebung/aufgaben";
import { SimShell, type Ask, type Distro } from "@/lib/uebung/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const STORAGE_KEY = "uebung-erledigt";

function loadDone(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
}

function saveDone(value: Record<string, string[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* privater Modus: Fortschritt nur für diese Sitzung */
  }
}

const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");

/** Zeileneditor über xterm.js, der Befehle an die simulierte Shell gibt */
function attachShell(term: Terminal, sh: SimShell, onChange: () => void) {
  let buffer = "";
  let pos = 0;
  let ask: Ask | null = null;
  let busy = false;
  let histIndex = -1;
  const prompt = () => (ask ? ask.prompt : sh.promptText());

  // Zeile des Cursors relativ zum Zeilenanfang (lange Eingaben brechen um)
  let cursorRow = 0;
  const rowOf = (offset: number, cols: number, atEnd: boolean) =>
    atEnd && offset > 0 && offset % cols === 0 ? offset / cols - 1 : Math.floor(offset / cols);

  /** Zeichnet Prompt und Eingabe neu, auch wenn sie über mehrere Zeilen umbricht */
  const redraw = () => {
    const shown = ask?.secret ? "" : buffer;
    const p = prompt();
    const cols = term.cols;
    if (cursorRow > 0) term.write(`\x1b[${cursorRow}A`);
    term.write(`\r\x1b[J${p}${shown}`);
    const total = p.length + shown.length;
    const target = p.length + (ask?.secret ? 0 : pos);
    const endRow = rowOf(total, cols, true);
    if (target === total) {
      cursorRow = endRow;
      return;
    }
    const targetRow = Math.floor(target / cols);
    if (endRow > targetRow) term.write(`\x1b[${endRow - targetRow}A`);
    term.write("\r");
    if (target % cols > 0) term.write(`\x1b[${target % cols}C`);
    cursorRow = targetRow;
  };

  const submit = async () => {
    const line = buffer;
    pos = buffer.length;
    redraw();
    buffer = "";
    pos = 0;
    cursorRow = 0;
    histIndex = -1;
    term.write("\r\n");
    busy = true;
    try {
      const r = ask ? await ask.answer(line) : await sh.exec(line);
      if (r.out) term.write(crlf(r.out) + (r.out.endsWith("\x1b[H") ? "" : "\r\n"));
      ask = r.ask ?? null;
    } catch (err) {
      term.write(crlf(`Fehler: ${err instanceof Error ? err.message : String(err)}`) + "\r\n");
      ask = null;
    }
    busy = false;
    onChange();
    term.write(prompt());
  };

  const complete = () => {
    const before = buffer.slice(0, pos);
    const start = before.lastIndexOf(" ") + 1;
    const word = before.slice(start);
    const options = sh.complete(word, before.trim().split(/\s+/).length <= 1 && !before.endsWith(" ") ? true : start === 0);
    if (!options.length) return;
    let common = options[0]!;
    for (const o of options) while (!o.startsWith(common)) common = common.slice(0, -1);
    if (options.length === 1 && !common.endsWith("/")) common += " ";
    if (common.length > word.length) {
      buffer = buffer.slice(0, start) + common + buffer.slice(pos);
      pos = start + common.length;
      redraw();
    } else if (options.length > 1) {
      const keep = pos;
      pos = buffer.length;
      redraw();
      term.write("\r\n" + options.join("  ") + "\r\n");
      cursorRow = 0;
      pos = keep;
      redraw();
    }
  };

  return term.onData((data) => {
    if (busy) return;
    if (data === "\r") return void submit();
    if (data === "\x7f" || data === "\b") {
      if (pos > 0) {
        buffer = buffer.slice(0, pos - 1) + buffer.slice(pos);
        pos--;
        redraw();
      }
      return;
    }
    if (data === "\x03") {
      term.write("^C\r\n");
      buffer = "";
      pos = 0;
      cursorRow = 0;
      ask = null;
      term.write(prompt());
      return;
    }
    if (data === "\x0c") {
      term.write("\x1b[2J\x1b[H");
      cursorRow = 0;
      redraw();
      return;
    }
    if (data === "\t") return ask ? undefined : complete();
    if (data === "\x1b[A" || data === "\x1b[B") {
      if (ask) return;
      const h = sh.history;
      if (!h.length) return;
      histIndex = data === "\x1b[A" ? (histIndex < 0 ? h.length - 1 : Math.max(0, histIndex - 1)) : histIndex < 0 ? -1 : histIndex + 1;
      if (histIndex >= h.length) histIndex = -1;
      buffer = histIndex < 0 ? "" : h[histIndex]!;
      pos = buffer.length;
      redraw();
      return;
    }
    if (data === "\x1b[D") {
      if (pos > 0) {
        pos--;
        redraw();
      }
      return;
    }
    if (data === "\x1b[C") {
      if (pos < buffer.length) {
        pos++;
        redraw();
      }
      return;
    }
    if (data === "\x1b[H" || data === "\x01") {
      pos = 0;
      redraw();
      return;
    }
    if (data === "\x1b[F" || data === "\x05") {
      pos = buffer.length;
      redraw();
      return;
    }
    if (data.startsWith("\x1b")) return;
    // Normale Eingabe oder Einfügen (mehrere Zeilen werden nacheinander ausgeführt)
    const [first, ...rest] = data.replace(/\r\n/g, "\r").split("\r");
    const text = first!.replace(/[\x00-\x1f]/g, "");
    buffer = buffer.slice(0, pos) + text + buffer.slice(pos);
    pos += text.length;
    redraw();
    if (rest.length) void submit();
  });
}

export function PracticeTerminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [distro, setDistro] = useState<Distro>("ubuntu");
  const [generation, setGeneration] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [everDone, setEverDone] = useState<Record<string, string[]>>({});
  const [hints, setHints] = useState<Set<string>>(new Set());
  const shellRef = useRef<SimShell | null>(null);
  const aufgaben = aufgabenFuer(distro);

  const evaluate = useCallback(() => {
    const sh = shellRef.current;
    if (!sh) return;
    const now = aufgabenFuer(sh.distro).filter((a) => a.check(sh)).map((a) => a.id);
    setDone(now);
    if (now.length) {
      const stored = loadDone();
      const merged = { ...stored, [sh.distro]: [...new Set([...(stored[sh.distro] ?? []), ...now])] };
      saveDone(merged);
      setEverDone(merged);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let term: Terminal | null = null;
    let sub: { dispose(): void } | null = null;
    let observer: ResizeObserver | null = null;
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !containerRef.current) return;
      term = new Terminal({
        cursorBlink: true,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 14,
        theme: { background: "#050a14" },
        scrollback: 3000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      observer = new ResizeObserver(() => fit.fit());
      observer.observe(containerRef.current);
      const sh = new SimShell(distro);
      shellRef.current = sh;
      setDone([]);
      setEverDone(loadDone());
      term.write(
        crlf(
          `Übungsterminal: simuliertes ${distro === "ubuntu" ? "Ubuntu 24.04" : "Debian 12"}. Alles läuft nur in deinem Browser.\n` +
            `Du bist schueler (Passwort: uebung)${distro === "debian" ? ", das root-Passwort ist root" : ""}. „help“ zeigt die Befehle.\n\n`,
        ) + sh.promptText(),
      );
      sub = attachShell(term, sh, evaluate);
      term.focus();
    })();
    return () => {
      disposed = true;
      sub?.dispose();
      observer?.disconnect();
      term?.dispose();
    };
  }, [distro, generation, evaluate]);

  const finished = aufgaben.every((a) => done.includes(a.id));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            System
            <select
              value={distro}
              onChange={(e) => setDistro(e.target.value as Distro)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="ubuntu">Ubuntu 24.04</option>
              <option value="debian">Debian 12</option>
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={() => setGeneration((g) => g + 1)}>
            Zurücksetzen
          </Button>
        </div>
        <div className="h-[460px] overflow-hidden rounded-lg border border-border bg-[#050a14] p-2" onClick={() => containerRef.current?.querySelector("textarea")?.focus()}>
          <div ref={containerRef} className="h-full" />
        </div>
        <p className="text-xs text-muted">
          Das Terminal ist eine Simulation: Es kennt die wichtigsten Befehle rund um Benutzer, sudo und SSH-Keys und verhält sich dabei wie ein echter Server,
          inklusive typischer Fehlermeldungen. Die Keys sind echt, verlassen aber nie deinen Browser.
        </p>
      </div>
      <aside className="space-y-3">
        <h2 className="font-semibold">Aufgaben</h2>
        {finished && (
          <Card className="border-primary/40 bg-primary/10 p-4 text-sm">
            Alles geschafft! Du hast einen Server so eingerichtet, wie es auch in echt sein sollte.
          </Card>
        )}
        <ol className="space-y-2">
          {aufgaben.map((a, i) => {
            const ok = done.includes(a.id);
            const before = !ok && everDone[distro]?.includes(a.id);
            return (
              <li key={a.id} className={`rounded-lg border p-3 text-sm ${ok ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                <p className="font-medium">
                  <span aria-hidden className="mr-1">
                    {ok ? "✓" : `${i + 1}.`}
                  </span>
                  {a.titel}
                  {ok && <span className="sr-only"> (erledigt)</span>}
                </p>
                <p className="mt-1 text-muted">{a.text}</p>
                {before && <p className="mt-1 text-xs text-muted">Früher schon einmal gelöst.</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setHints((h) => new Set(h.has(a.id) ? [...h].filter((x) => x !== a.id) : [...h, a.id]))}
                  >
                    {hints.has(a.id) ? "Tipp ausblenden" : "Tipp zeigen"}
                  </button>
                  {a.lektion && (
                    <Link href={a.lektion} className="text-primary hover:underline">
                      Lektion lesen
                    </Link>
                  )}
                </div>
                {hints.has(a.id) && <p className="mt-2 rounded bg-border/40 p-2 font-mono text-xs break-words">{a.tipp}</p>}
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
