import type { ReactNode } from "react";

const STYLES = {
  info: { box: "border-primary/40 bg-primary/10", label: "Gut zu wissen" },
  tipp: { box: "border-primary/40 bg-primary/10", label: "Tipp" },
  warnung: { box: "border-warning/50 bg-warning/10", label: "Achtung" },
  gefahr: { box: "border-danger/50 bg-danger/10", label: "Vorsicht, Aussperrgefahr" },
  profi: { box: "border-border bg-card", label: "Für Profis" },
} as const;

export function Hinweis({ typ = "info", titel, children }: { typ?: keyof typeof STYLES; titel?: string; children: ReactNode }) {
  const s = STYLES[typ];
  if (typ === "profi") {
    return (
      <details className={`my-6 rounded-lg border px-4 py-3 ${s.box}`}>
        <summary className="cursor-pointer font-medium">{titel ?? s.label}</summary>
        <div className="mt-2 [&>*:first-child]:mt-0">{children}</div>
      </details>
    );
  }
  return (
    <aside className={`my-6 rounded-lg border px-4 py-3 ${s.box}`}>
      <p className="mb-1 text-sm font-semibold">{titel ?? s.label}</p>
      <div className="text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div>
    </aside>
  );
}
