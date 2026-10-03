"use client";
import "@xterm/xterm/css/xterm.css";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Event = { t: number; type: "o" | "r"; data: string };

/** Pausen über diesem Wert werden beim Abspielen verkürzt */
const MAX_IDLE = 2;

function parse(text: string) {
  const [headerLine, ...rest] = text.split("\n").filter(Boolean);
  const header = JSON.parse(headerLine ?? "{}") as { width?: number; height?: number };
  const events: Event[] = [];
  let shift = 0;
  let last = 0;
  for (const line of rest) {
    const [t, type, data] = JSON.parse(line) as [number, string, string];
    if (type !== "o" && type !== "r") continue;
    // Lange Pausen kürzen, damit man nicht minutenlang auf ein stilles Terminal schaut
    if (t - last > MAX_IDLE) shift += t - last - MAX_IDLE;
    last = t;
    events.push({ t: t - shift, type, data });
  }
  return { cols: header.width ?? 80, rows: header.height ?? 24, events };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Abspiel-Steuerung außerhalb von React: hält Position und Timer */
function createPlayback(term: Terminal, data: ReturnType<typeof parse>, onTime: (t: number) => void, onPlaying: (p: boolean) => void) {
  let index = 0;
  let time = 0;
  let speed = 1;
  let timer: number | null = null;

  const apply = (e: Event) => {
    if (e.type === "o") term.write(e.data);
    else {
      const [c, r] = e.data.split("x").map(Number);
      if (c && r) term.resize(c, r);
    }
  };
  const schedule = () => {
    const next = data.events[index];
    if (!next) {
      timer = null;
      onPlaying(false);
      return;
    }
    timer = window.setTimeout(() => {
      apply(next);
      index += 1;
      time = next.t;
      onTime(time);
      schedule();
    }, Math.max(0, ((next.t - time) * 1000) / speed));
  };
  const clear = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  const api = {
    play() {
      if (timer !== null) return;
      if (index >= data.events.length) api.seek(0);
      onPlaying(true);
      schedule();
    },
    pause() {
      clear();
      onPlaying(false);
    },
    seek(target: number) {
      const wasPlaying = timer !== null;
      clear();
      term.reset();
      term.resize(data.cols, data.rows);
      index = 0;
      while (index < data.events.length && data.events[index]!.t <= target) apply(data.events[index++]!);
      time = target;
      onTime(time);
      if (wasPlaying) schedule();
    },
    setSpeed(s: number) {
      speed = s;
      if (timer !== null) {
        clear();
        schedule();
      }
    },
    dispose: clear,
  };
  return api;
}

export function RecordingPlayer({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<ReturnType<typeof createPlayback> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let disposed = false;
    let term: Terminal | null = null;
    void (async () => {
      try {
        const [{ Terminal }, res] = await Promise.all([import("@xterm/xterm"), fetch(src, { cache: "no-store" })]);
        if (!res.ok) throw new Error(res.status === 404 ? "Aufzeichnung nicht gefunden." : "Aufzeichnung konnte nicht geladen werden.");
        const data = parse(await res.text());
        if (disposed || !containerRef.current) return;
        term = new Terminal({
          cols: data.cols,
          rows: data.rows,
          disableStdin: true,
          cursorBlink: false,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 14,
          theme: { background: "#050a14" },
          scrollback: 5000,
        });
        term.open(containerRef.current);
        playbackRef.current = createPlayback(term, data, setTime, setPlaying);
        setTotal(data.events.at(-1)?.t ?? 0);
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Aufzeichnung konnte nicht geladen werden.");
      }
    })();
    return () => {
      disposed = true;
      playbackRef.current?.dispose();
      term?.dispose();
    };
  }, [src]);

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="overflow-x-auto rounded-lg border border-border bg-[#050a14] p-2">
        <div ref={containerRef} />
      </div>
      {ready && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Button type="button" onClick={() => (playing ? playbackRef.current?.pause() : playbackRef.current?.play())}>
            {playing ? "Pause" : "Abspielen"}
          </Button>
          <input
            type="range"
            aria-label="Position"
            min={0}
            max={total}
            step={0.1}
            value={time}
            onChange={(e) => playbackRef.current?.seek(Number(e.target.value))}
            className="min-w-40 flex-1"
          />
          <span className="font-mono text-xs text-muted">
            {fmt(time)} / {fmt(total)}
          </span>
          <label className="flex items-center gap-1 text-xs">
            Tempo
            <select
              value={speed}
              onChange={(e) => {
                const s = Number(e.target.value);
                setSpeed(s);
                playbackRef.current?.setSpeed(s);
              }}
              className="rounded border border-border bg-background px-1 py-0.5"
            >
              {[0.5, 1, 2, 4, 8].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <p className="text-xs text-muted">Pausen über {MAX_IDLE} Sekunden werden beim Abspielen verkürzt. Tastatureingaben sind nur sichtbar, soweit der Server sie angezeigt hat.</p>
    </div>
  );
}
