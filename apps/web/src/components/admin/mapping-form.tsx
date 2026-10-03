"use client";
import { useActionState, useState } from "react";
import { addMapping } from "@/app/admin/pocket-id/actions";
import { TEAM_ROLE_LABELS, TEAM_ROLES } from "@/lib/permissions";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Field } from "../ui/field";

const selectClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function MappingForm({ teams }: { teams: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addMapping, undefined);
  const [target, setTarget] = useState<"team" | "platform_admin">("team");

  return (
    <Card>
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <Field id="externalGroup" name="externalGroup" label="Pocket-ID-Gruppe" placeholder="z. B. ssh-admins" required />
        <div className="space-y-1">
          <label htmlFor="target" className="block text-sm font-medium">
            Ziel
          </label>
          <select
            id="target"
            name="target"
            className={selectClass}
            value={target}
            onChange={(e) => setTarget(e.target.value as typeof target)}
          >
            <option value="team">Team-Rolle</option>
            <option value="platform_admin">Plattform-Administrator</option>
          </select>
        </div>
        {target === "team" && (
          <>
            <div className="space-y-1">
              <label htmlFor="organizationId" className="block text-sm font-medium">
                Team
              </label>
              <select id="organizationId" name="organizationId" className={selectClass} required>
                {teams.length === 0 && <option value="">Erst ein Team anlegen</option>}
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="role" className="block text-sm font-medium">
                Rolle
              </label>
              <select id="role" name="role" className={selectClass} defaultValue="member">
                {TEAM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {TEAM_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            Zuordnung hinzufügen
          </Button>
        </div>
      </form>
      {state?.error && (
        <div className="mt-3">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
    </Card>
  );
}
