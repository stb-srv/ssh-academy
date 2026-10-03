"use client";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Field } from "../ui/field";

export function TwoFactorSetup({ enabled, hasPassword }: { enabled: boolean; hasPassword: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "password" | "verify" | "disable">("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    if (err || !data || data.method !== "totp") {
      setError("Das Passwort ist falsch.");
      return;
    }
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }));
    setSecret(new URL(data.totpURI).searchParams.get("secret"));
    setBackupCodes(data.backupCodes);
    setStep("verify");
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    if (err) {
      setError("Der Code stimmt nicht. Prüfe die Uhrzeit auf deinem Handy.");
      return;
    }
    setStep("idle");
    router.refresh();
  }

  async function disable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { error: err } = await authClient.twoFactor.disable({ password });
    if (err) {
      setError("Das Passwort ist falsch.");
      return;
    }
    setStep("idle");
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Zwei-Faktor mit Authenticator-App</h2>
          <p className="text-sm text-muted">
            Zusätzlich zum Passwort ein 6-stelliger Code aus einer App wie Aegis, 2FAS, Google Authenticator
            oder 1Password.
          </p>
        </div>
        {hasPassword && step === "idle" && (
          <Button variant={enabled ? "secondary" : "primary"} onClick={() => setStep(enabled ? "disable" : "password")}>
            {enabled ? "Deaktivieren" : "Einrichten"}
          </Button>
        )}
      </div>

      {!hasPassword && (
        <Alert>Du meldest dich ohne Passwort an (Passkey oder Pocket ID). Das ist bereits eine starke Anmeldung.</Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {(step === "password" || step === "disable") && (
        <form onSubmit={step === "password" ? start : disable} className="space-y-3">
          <Field id="2fa-password" name="password" type="password" label="Zur Bestätigung dein Passwort" autoComplete="current-password" required />
          <div className="flex gap-2">
            <Button type="submit">Weiter</Button>
            <Button type="button" variant="ghost" onClick={() => setStep("idle")}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}

      {step === "verify" && qr && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Scanne den QR-Code mit deiner Authenticator-App.</li>
            <li>Speichere die Wiederherstellungscodes an einem sicheren Ort (z. B. im Passwort-Manager).</li>
            <li>Gib den Code aus der App ein.</li>
          </ol>
          <div className="flex flex-wrap items-start gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR-Code für die Authenticator-App" width={200} height={200} className="rounded-lg bg-white" />
            <div className="space-y-2 text-sm">
              {secret && (
                <p>
                  Manuell: <code className="break-all font-mono">{secret}</code>
                </p>
              )}
              <p className="font-medium">Wiederherstellungscodes:</p>
              <ul className="grid grid-cols-2 gap-1 font-mono">
                {backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
          <form onSubmit={verify} className="flex items-end gap-2">
            <Field id="totp" name="code" label="Code aus der App" inputMode="numeric" autoComplete="one-time-code" required />
            <Button type="submit">Aktivieren</Button>
          </form>
        </div>
      )}
    </Card>
  );
}
