import type { ComponentProps } from "react";

export const controlClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60";

export function SelectField({ label, hint, id, children, ...props }: ComponentProps<"select"> & { label: string; hint?: string; id: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select id={id} className={controlClass} {...props}>
        {children}
      </select>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
