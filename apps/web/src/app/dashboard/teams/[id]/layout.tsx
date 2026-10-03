import Link from "next/link";
import { TeamTabs } from "@/components/teams/team-tabs";
import { TEAM_ROLE_LABELS } from "@/lib/permissions";
import { loadTeam } from "@/lib/team";

export default async function TeamLayout({ children, params }: LayoutProps<"/dashboard/teams/[id]">) {
  const { id } = await params;
  const { org, role, can } = await loadTeam(id);
  const tabs = [
    { href: "", label: "Mitglieder" },
    { href: "/gruppen", label: "Gruppen" },
    { href: "/server-gruppen", label: "Server-Gruppen" },
    { href: "/freigaben", label: "Freigaben" },
    ...(can.readAudit ? [{ href: "/aktivitaet", label: "Aktivität" }] : []),
    ...(can.readRecordings ? [{ href: "/aufzeichnungen", label: "Aufzeichnungen" }] : []),
    ...(can.settings ? [{ href: "/einstellungen", label: "Einstellungen" }] : []),
  ];
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/teams" className="text-sm text-muted hover:underline">
          ← Alle Teams
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{org.name}</h1>
        <p className="text-sm text-muted">Deine Rolle: {TEAM_ROLE_LABELS[role]}</p>
      </div>
      <TeamTabs base={`/dashboard/teams/${id}`} tabs={tabs} />
      {children}
    </div>
  );
}
