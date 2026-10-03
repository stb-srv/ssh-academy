import type { ReactNode } from "react";

const tones = {
  info: "border-primary/40 bg-primary/10",
  warning: "border-warning/40 bg-warning/10",
  error: "border-danger/40 bg-danger/10",
} as const;

export function Alert({ tone = "info", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
