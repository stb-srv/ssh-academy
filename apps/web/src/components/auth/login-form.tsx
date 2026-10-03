"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { PublicAuthConfig } from "@/lib/public-config";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Field } from "../ui/field";
import { PocketIdButton } from "./pocket-id-button";

export function LoginForm({
  config,
  next,
  initialError,
}: {
  config: PublicAuthConfig;
  next: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);

  // Passkey-Vorschläge direkt im E-Mail-Feld (Conditional UI)
  useEffect(() => {
    if (!config.localLogin) return;
    if (typeof PublicKeyCredential === "undefined") return;
    void PublicKeyCredential.isConditionalMediationAvailable?.().then((ok) => {
      if (ok) void authClient.signIn.passkey({ autoFill: true }).then(({ error: e }) => !e && router.push(next));
    });
  }, [config.localLogin, next, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error: err } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL: next,
    });
    setPending(false);
    if (err) {
      setError(
        err.status === 403
          ? "Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir einen Link geschickt."
          : "E-Mail oder Passwort ist falsch.",
      );
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function passkeyLogin() {
    setError(null);
    const { error: err } = await authClient.signIn.passkey();
    if (err) {
      setError("Die Anmeldung mit Passkey hat nicht geklappt.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <Card className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Anmelden</h1>
        <p className="text-sm text-muted">Willkommen zurück bei der SSH-Academy.</p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {config.pocketId && <PocketIdButton name={config.pocketId.name} next={next} />}

      {config.localLogin && (
        <>
          {config.pocketId && <Divider />}
          <Button type="button" variant="secondary" className="w-full" onClick={passkeyLogin}>
            Mit Passkey anmelden
          </Button>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field
              id="email"
              name="email"
              type="email"
              label="E-Mail"
              autoComplete="username webauthn"
              required
            />
            <Field id="password" name="password" type="password" label="Passwort" autoComplete="current-password" required />
            <div className="flex items-center justify-between">
              <Link href="/passwort-vergessen" className="text-sm text-primary hover:underline">
                Passwort vergessen?
              </Link>
              <Button type="submit" disabled={pending}>
                {pending ? "Anmelden …" : "Anmelden"}
              </Button>
            </div>
          </form>
        </>
      )}

      {config.registrationOpen && (
        <p className="text-center text-sm text-muted">
          Noch kein Konto?{" "}
          <Link href="/registrieren" className="text-primary hover:underline">
            Registrieren
          </Link>
        </p>
      )}
    </Card>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-border" />
      oder
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
