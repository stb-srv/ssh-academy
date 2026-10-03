import type { Metadata } from "next";
import { asc, eq, schema } from "@ssh-academy/db";
import { MappingForm } from "@/components/admin/mapping-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { env, POCKET_ID_PROVIDER, pocketIdEnabled } from "@/lib/env";
import { TEAM_ROLE_LABELS, type TeamRole } from "@/lib/permissions";
import { deleteMapping } from "./actions";

export const metadata: Metadata = { title: "Pocket ID" };

export default async function PocketIdAdminPage() {
  const teams = await db
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.organization)
    .orderBy(asc(schema.organization.name));
  const mappings = await db
    .select({
      id: schema.idpGroupMapping.id,
      externalGroup: schema.idpGroupMapping.externalGroup,
      role: schema.idpGroupMapping.role,
      platformRole: schema.idpGroupMapping.platformRole,
      teamName: schema.organization.name,
    })
    .from(schema.idpGroupMapping)
    .leftJoin(schema.organization, eq(schema.organization.id, schema.idpGroupMapping.organizationId))
    .where(eq(schema.idpGroupMapping.providerId, POCKET_ID_PROVIDER))
    .orderBy(asc(schema.idpGroupMapping.externalGroup));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pocket ID</h1>

      {pocketIdEnabled ? (
        <Card className="space-y-1 text-sm">
          <p>
            <span className="font-medium">Instanz:</span> {env.POCKET_ID_URL}
          </p>
          <p>
            <span className="font-medium">Callback-URL für den OIDC-Client:</span>{" "}
            <code className="font-mono">{env.APP_URL}/api/auth/callback/pocket-id</code>
          </p>
          <p>
            <span className="font-medium">Neue Konten automatisch anlegen:</span>{" "}
            {env.POCKET_ID_AUTO_PROVISION ? "ja" : "nein"}
          </p>
          <p>
            <span className="font-medium">Erlaubte Gruppen:</span>{" "}
            {env.POCKET_ID_ALLOWED_GROUPS.length ? env.POCKET_ID_ALLOWED_GROUPS.join(", ") : "alle"}
          </p>
          <p>
            <span className="font-medium">Sitzungsdauer:</span> {env.POCKET_ID_MAX_SESSION_HOURS} Stunden
          </p>
        </Card>
      ) : (
        <Alert tone="warning">
          Pocket ID ist nicht eingerichtet. Setze POCKET_ID_URL, POCKET_ID_CLIENT_ID und POCKET_ID_CLIENT_SECRET in
          der Konfiguration (siehe README).
        </Alert>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Gruppen-Zuordnungen</h2>
        <p className="text-sm text-muted">
          Wer in Pocket ID in einer dieser Gruppen ist, bekommt beim nächsten Login automatisch die Rolle. Wird
          die Gruppe in Pocket ID entfernt, wird die Rolle beim nächsten Login wieder entzogen. Manuell
          vergebene Mitgliedschaften bleiben unverändert.
        </p>
        <Card className="p-0">
          {mappings.length === 0 ? (
            <p className="p-4 text-sm text-muted">Noch keine Zuordnungen.</p>
          ) : (
            <ul className="divide-y divide-border">
              {mappings.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                  <span>
                    <code className="font-mono">{m.externalGroup}</code>
                    {" → "}
                    {m.platformRole
                      ? "Plattform-Administrator"
                      : `${m.teamName ?? "?"}, ${TEAM_ROLE_LABELS[m.role as TeamRole] ?? m.role}`}
                  </span>
                  <form action={deleteMapping}>
                    <input type="hidden" name="id" value={m.id} />
                    <Button variant="ghost" type="submit">
                      Entfernen
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <MappingForm teams={teams} />
      </section>
    </div>
  );
}
