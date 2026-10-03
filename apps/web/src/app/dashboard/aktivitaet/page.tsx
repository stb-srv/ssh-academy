import type { Metadata } from "next";
import { AuditList } from "@/components/dashboard/audit-list";
import { Card } from "@/components/ui/card";
import { loadAudit, personalAudit } from "@/lib/audit-query";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Aktivität" };

export default async function ActivityPage() {
  const session = await requireSession();
  const rows = await loadAudit(personalAudit(session.user.id), 200);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Deine Aktivität</h1>
      <p className="text-sm text-muted">Alles, was du auf der Plattform getan hast, mit Zeit und IP-Adresse. Einträge lassen sich nicht löschen.</p>
      <Card>
        <AuditList rows={rows} />
      </Card>
    </div>
  );
}
