"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Field } from "../ui/field";

export function TwoFactorForm() {
  const router = useRouter();
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const code = String(form.get("code")).replace(/\s/g, "");
    const trustDevice = form.get("trust") === "on";
    const { error: err } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    if (err) {
      setError("Der Code ist ungültig oder abgelaufen.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bestätigung</h1>
        <p className="text-sm text-muted">
          {useBackup
            ? "Gib einen deiner Wiederherstellungscodes ein."
            : "Gib den 6-stelligen Code aus deiner Authenticator-App ein."}
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          id="code"
          name="code"
          label={useBackup ? "Wiederherstellungscode" : "Code"}
          inputMode={useBackup ? "text" : "numeric"}
          autoComplete="one-time-code"
          autoFocus
          required
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="trust" /> Diesem Gerät 30 Tage vertrauen
        </label>
        <Button type="submit" className="w-full">
          Bestätigen
        </Button>
      </form>
      <button type="button" className="text-sm text-primary hover:underline" onClick={() => setUseBackup(!useBackup)}>
        {useBackup ? "Doch die Authenticator-App nutzen" : "Keinen Zugriff auf die App? Wiederherstellungscode nutzen"}
      </button>
    </Card>
  );
}
