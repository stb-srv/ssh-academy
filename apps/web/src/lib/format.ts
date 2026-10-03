const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

export const formatDateTime = (d: Date | string | null | undefined) => (d ? dateTime.format(new Date(d)) : "–");
export const formatDate = (d: Date | string | null | undefined) => (d ? date.format(new Date(d)) : "–");

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const KEY_MODE_LABELS = { download: "Nur heruntergeladen", vault: "Im Tresor", imported: "Importiert" } as const;
export const nowMs = () => Date.now();
