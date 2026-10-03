"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const newPassword = String(new FormData(e.currentTarget).get("password"));
    const { error } = await authClient.resetPassword({ newPassword, token });
    setState(error ? "error" : "done");
  }

  if (!token) return <Alert tone="error">Der Link ist ungültig. Bitte fordere einen neuen an.</Alert>;
  if (state === "done")
    return (
      <Alert>
        Dein Passwort wurde geändert.{" "}
        <Link href="/anmelden" className="underline">
          Jetzt anmelden
        </Link>
      </Alert>
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state === "error" && <Alert tone="error">Der Link ist abgelaufen oder das Passwort ist nicht erlaubt.</Alert>}
      <Field id="password" name="password" type="password" label="Neues Passwort" autoComplete="new-password" minLength={12} required />
      <Button type="submit" className="w-full">
        Passwort speichern
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Card className="space-y-6">
      <h1 className="text-2xl font-bold">Neues Passwort</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </Card>
  );
}
