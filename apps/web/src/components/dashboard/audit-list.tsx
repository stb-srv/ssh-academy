import { auditLabel } from "@/lib/audit-labels";
import { formatDateTime } from "@/lib/format";

export type AuditRow = {
  id: string;
  action: string;
  createdAt: Date;
  actorName: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
  targetType: string | null;
};

function summary(meta: Record<string, unknown>) {
  const parts: string[] = [];
  for (const k of ["linuxUser", "host", "fingerprint", "path", "user", "reason", "error", "role", "command", "name"]) {
    const v = meta[k];
    if (typeof v === "string" && v) parts.push(k === "linuxUser" ? `als ${v}` : v);
  }
  return parts.join(" · ").slice(0, 200);
}

export function AuditList({ rows, showActor = false }: { rows: AuditRow[]; showActor?: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted">Noch keine Einträge.</p>;
  return (
    <ol className="divide-y divide-border text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-2">
          <span className="w-36 shrink-0 text-muted">{formatDateTime(r.createdAt)}</span>
          <span className={`font-medium ${/failed|mismatch|offboarded|disabled/.test(r.action) ? "text-danger" : ""}`}>{auditLabel(r.action)}</span>
          {showActor && r.actorName && <span className="text-muted">von {r.actorName}</span>}
          <span className="min-w-0 flex-1 break-all text-muted">{summary(r.metadata)}</span>
          {r.ip && <span className="font-mono text-xs text-muted">{r.ip}</span>}
        </li>
      ))}
    </ol>
  );
}
