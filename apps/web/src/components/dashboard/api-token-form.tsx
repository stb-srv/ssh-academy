"use client";
import { useActionState } from "react";
import { createApiToken } from "@/app/dashboard/api-tokens/actions";
import { CodeBlock } from "@/components/lernen/code-block";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";

export function ApiTokenForm({ scopes, baseUrl }: { scopes: Record<string, string>; baseUrl: string }) {
  const [state, action, pending] = useActionState(createApiToken, undefined);
  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Neues Token</h2>
      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="tok-name" name="name" label="Name" placeholder="z. B. Laptop-Skript" required />
          <SelectField id="tok-days" name="days" label="Gültig" defaultValue="90">
            <option value="7">7 Tage</option>
            <option value="30">30 Tage</option>
            <option value="90">90 Tage</option>
            <option value="365">1 Jahr</option>
            <option value="0">Unbegrenzt</option>
          </SelectField>
        </div>
        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-medium">Rechte</legend>
          {Object.entries(scopes).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="scopes" value={value} defaultChecked={value.endsWith(":read")} />
              {label} <code className="font-mono text-xs text-muted">{value}</code>
            </label>
          ))}
        </fieldset>
        {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
        <Button type="submit" disabled={pending}>
          Token erstellen
        </Button>
      </form>
      {state?.ok && (
        <div className="space-y-2 border-t border-border pt-4">
          <Alert tone="warning">Kopiere das Token jetzt. Es wird nur dieses eine Mal angezeigt.</Alert>
          <CodeBlock>{state.token}</CodeBlock>
          <p className="text-sm text-muted">Beispiel:</p>
          <CodeBlock>{`curl -H "Authorization: Bearer ${state.token}" ${baseUrl}/api/v1/me`}</CodeBlock>
        </div>
      )}
    </Card>
  );
}
