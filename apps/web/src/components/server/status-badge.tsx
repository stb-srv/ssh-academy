import { Badge } from "@/components/ui/badge";

const LABELS = {
  online: ["erreichbar", "good"],
  offline: ["nicht erreichbar", "bad"],
  host_key_mismatch: ["Host-Key geändert!", "bad"],
  unknown: ["unbekannt", "neutral"],
} as const;

export function ServerStatusBadge({ status, confirmed }: { status: keyof typeof LABELS; confirmed: boolean }) {
  if (!confirmed && status !== "host_key_mismatch") return <Badge tone="warn">Fingerprint unbestätigt</Badge>;
  const [label, tone] = LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
