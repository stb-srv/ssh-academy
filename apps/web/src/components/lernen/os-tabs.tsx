"use client";
import type { ReactNode } from "react";
import { OS_LABELS, useOs, type OsName } from "./os-context";

/**
 * Zeigt Inhalte passend zum gewählten Betriebssystem. Verwendung in MDX:
 * <OsTabs><Os name="linux">…</Os><Os name="windows">…</Os></OsTabs>
 * Fehlt ein System, gilt der Inhalt von "linux" bzw. "unix" (Linux und macOS).
 */
export function OsTabs({ children, systems = ["linux", "macos", "windows"] }: { children: ReactNode; systems?: OsName[] }) {
  const { os, setOs } = useOs();
  const active = systems.includes(os) ? os : systems[0]!;
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border border-border" data-os={active}>
      <div role="tablist" aria-label="Betriebssystem" className="flex border-b border-border bg-card">
        {systems.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === active}
            onClick={() => setOs(s)}
            className={`px-4 py-2 text-sm ${s === active ? "border-b-2 border-primary font-medium text-primary" : "text-muted hover:text-foreground"}`}
          >
            {OS_LABELS[s]}
          </button>
        ))}
      </div>
      <div className="os-panels px-4 py-1">{children}</div>
    </div>
  );
}

export function Os({ name, children }: { name: OsName | "unix"; children: ReactNode }) {
  return (
    <div data-os-panel={name} className="prose-inner">
      {children}
    </div>
  );
}
