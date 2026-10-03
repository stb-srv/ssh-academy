import type { Metadata } from "next";
import { DeleteTeamCard, TeamSettingsForm } from "@/components/teams/team-settings-form";
import { getTeamSettings } from "@/lib/access";
import { loadTeamWith } from "@/lib/team";
import { deleteTeam, updateTeamSettings } from "../actions";

export const metadata: Metadata = { title: "Team-Einstellungen" };

export default async function TeamSettingsPage({ params }: PageProps<"/dashboard/teams/[id]/einstellungen">) {
  const { id } = await params;
  const { org, can } = await loadTeamWith(id, "settings");
  const settings = await getTeamSettings(id);
  return (
    <div className="space-y-6">
      <TeamSettingsForm
        action={updateTeamSettings.bind(null, id)}
        settings={{
          name: org.name,
          recordSessions: settings.recordSessions,
          idleTimeoutMinutes: settings.idleTimeoutMinutes,
          maxSessionHours: settings.maxSessionHours,
          maxCertMinutes: settings.maxCertMinutes,
        }}
      />
      {can.deleteTeam && <DeleteTeamCard name={org.name} action={deleteTeam.bind(null, id)} />}
    </div>
  );
}
