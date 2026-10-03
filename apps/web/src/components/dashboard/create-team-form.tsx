"use client";
import { useActionState } from "react";
import { createTeam } from "@/app/dashboard/teams/actions";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Field } from "../ui/field";

export function CreateTeamForm() {
  const [state, action, pending] = useActionState(createTeam, undefined);
  return (
    <Card>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <Field id="team-name" name="name" label="Neues Team" placeholder="z. B. Infrastruktur" required />
        </div>
        <Button type="submit" disabled={pending}>
          Team anlegen
        </Button>
      </form>
      {state?.error && (
        <div className="mt-3">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
    </Card>
  );
}
