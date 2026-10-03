"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Field } from "../ui/field";

export function RegisterForm({ isFirstUser }: { isFirstUser: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== form.get("password2")) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: err } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password,
      callbackURL: "/dashboard",
    });
    setPending(false);
    if (err) {
      setError(err.message ?? "Die Registrierung ist fehlgeschlagen.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Card className="space-y-3">
        <h1 className="text-2xl font-bold">Fast geschafft</h1>
        <p className="text-sm">
          Wir haben dir eine E-Mail geschickt. Klicke auf den Link darin, um deine Adresse zu bestätigen.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Konto erstellen</h1>
        {isFirstUser && (
          <p className="mt-2 text-sm text-muted">
            Du bist der erste Nutzer dieser Installation und wirst automatisch Administrator.
          </p>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field id="name" name="name" label="Name" autoComplete="name" required />
        <Field id="email" name="email" type="email" label="E-Mail" autoComplete="email" required />
        <Field
          id="password"
          name="password"
          type="password"
          label="Passwort"
          autoComplete="new-password"
          minLength={12}
          hint="Mindestens 12 Zeichen. Ein Satz aus mehreren Wörtern ist sicher und leicht zu merken."
          required
        />
        <Field id="password2" name="password2" type="password" label="Passwort wiederholen" autoComplete="new-password" required />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Wird erstellt …" : "Konto erstellen"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        Schon registriert?{" "}
        <Link href="/anmelden" className="text-primary hover:underline">
          Anmelden
        </Link>
      </p>
    </Card>
  );
}
