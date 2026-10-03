"use client";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    await authClient.requestPasswordReset({ email, redirectTo: "/passwort-zuruecksetzen" });
    // Immer dieselbe Meldung, damit niemand herausfinden kann, welche E-Mails registriert sind.
    setSent(true);
  }

  return (
    <Card className="space-y-6">
      <h1 className="text-2xl font-bold">Passwort vergessen</h1>
      {sent ? (
        <Alert>Wenn ein Konto mit dieser E-Mail existiert, haben wir dir einen Link geschickt.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="email" name="email" type="email" label="E-Mail" autoComplete="email" required />
          <Button type="submit" className="w-full">
            Link anfordern
          </Button>
        </form>
      )}
    </Card>
  );
}
