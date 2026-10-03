import type { Metadata } from "next";
import { eq, schema } from "@ssh-academy/db";
import { AuditList } from "@/components/dashboard/audit-list";
import { Card } from "@/components/ui/card";
import { loadAudit } from "@/lib/audit-query";
import { loadTeamWith } from "@/lib/team";

export const metadata: Metadata = { title: "Team-Aktivität" };

export default async function TeamAuditPage({ params }: PageProps<"/dashboard/teams/[id]/aktivitaet">) {
  const { id } = await params;
  await loadTeamWith(id, "readAudit");
  const rows = await loadAudit(eq(schema.auditEvent.organizationId, id), 300);
  return (
    <Card>
      <p className="mb-3 text-sm text-muted">Die letzten 300 Ereignisse im Team. Einträge lassen sich nicht löschen.</p>
      <AuditList rows={rows} showActor />
    </Card>
  );
}
