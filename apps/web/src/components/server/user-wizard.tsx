"use client";
import Link from "next/link";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { allowPasswordlessSudo, createUser, deployKey, setUserPassword, applySshdConfig } from "@ssh-academy/ssh/ops";
import { buildSshdConfig, DEFAULT_SSHD_OPTIONS } from "@ssh-academy/ssh/sshd-config";
import { wizardCheck, wizardCreateUser, wizardDeployKey, wizardHarden, wizardSudoAccess, wizardTestLogin } from "@/app/dashboard/server/actions";
import { CodeBlock } from "@/components/lernen/code-block";
import { Checkbox } from "@/components/werkzeuge/inputs";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";
import { AuthFields, type AuthOption } from "./auth-fields";

type Key = { id: string; name: string; publicKey: string; vault: boolean };
type Privileges = { user: string; groups: string[]; sudo: "root" | "nopasswd" | "password" };

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children: ReactNode }) {
  return (
    <section className={`rounded-xl border p-5 ${active ? "border-primary bg-card" : "border-border bg-card/60"}`} aria-current={active ? "step" : undefined}>
      <h2 className="flex items-center gap-2 font-semibold">
        <span className={`flex size-7 items-center justify-center rounded-full text-sm ${done ? "bg-primary text-primary-foreground" : "border border-border"}`}>{done ? "✓" : n}</span>
        {title}
      </h2>
      {(active || done) && <div className="mt-4 space-y-3">{children}</div>}
    </section>
  );
}

function Preview({ script }: { script: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted">Befehl ansehen, der auf dem Server ausgeführt wird</summary>
      <CodeBlock>{script}</CodeBlock>
    </details>
  );
}

function Output({ text }: { text: string }) {
  return text ? <pre className="max-h-48 overflow-auto rounded-lg bg-terminal p-3 font-mono text-xs text-slate-200">{text}</pre> : null;
}

export function UserWizard({ server, authOptions, keys }: { server: { id: string; name: string; defaultUser: string; port: number }; authOptions: AuthOption[]; keys: Key[] }) {
  const [step, setStep] = useState(1);
  const [auth, setAuth] = useState<Record<string, string> | null>(null);
  const [check, setCheck] = useState<{ os: { os: string; pretty: string }; privileges: Privileges } | null>(null);
  const [newUser, setNewUser] = useState("");
  const [sudo, setSudo] = useState(true);
  const [sudoMode, setSudoMode] = useState<"password" | "nopasswd">("password");
  const [keyId, setKeyId] = useState(keys[0]?.id ?? "");
  const [tested, setTested] = useState(false);
  const [manualConfirm, setManualConfirm] = useState(false);
  const [disableRoot, setDisableRoot] = useState(true);
  const [disablePassword, setDisablePassword] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<number, string>>({});

  const key = keys.find((k) => k.id === keyId);
  const validUser = /^[a-z_][a-z0-9_-]{0,31}$/.test(newUser) && newUser !== "root";

  const sshdConfig = useMemo(
    () =>
      buildSshdConfig({
        ...DEFAULT_SSHD_OPTIONS,
        port: server.port,
        rootLogin: disableRoot ? "no" : "prohibit-password",
        passwordAuth: !disablePassword,
        tcpForwarding: true,
        modernCrypto: false,
      }).config,
    [server.port, disableRoot, disablePassword],
  );

  async function run<T extends { ok: boolean }>(stepNo: number, fn: () => Promise<T>, next: number, onOk?: (r: T) => void) {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (!r.ok) return setError((r as unknown as { error: string }).error);
      const out = (r as unknown as { output?: string }).output;
      if (out !== undefined) setOutputs((o) => ({ ...o, [stepNo]: out }));
      onOk?.(r);
      setStep(next);
    } finally {
      setBusy(false);
    }
  }

  function connect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    void run(1, () => wizardCheck({ serverId: server.id, ...values }), 2, (r) => {
      setAuth(values);
      setCheck(r as unknown as { os: { os: string; pretty: string }; privileges: Privileges });
    });
  }

  const base = { serverId: server.id, ...(auth ?? {}) };
  const unsupported = check && check.os.os === "other";

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Step n={1} title="Mit dem Server verbinden" done={step > 1} active={step === 1}>
        {step === 1 ? (
          <form onSubmit={connect} className="space-y-3">
            <p className="text-sm text-muted">Melde dich als root oder als Benutzer mit sudo-Rechten an. Neue Server erreichst du meist als root.</p>
            <AuthFields options={authOptions} defaultUser={server.defaultUser} needsRoot idPrefix="wiz" />
            <Button type="submit" disabled={busy}>
              {busy ? "Verbinde …" : "Verbindung prüfen"}
            </Button>
          </form>
        ) : (
          check && (
            <p className="text-sm">
              Verbunden als <strong>{check.privileges.user}</strong> auf {check.os.pretty}. sudo:{" "}
              {check.privileges.sudo === "root" ? "ist root" : check.privileges.sudo === "nopasswd" ? "ohne Passwort" : "mit Passwort"}
            </p>
          )
        )}
        {unsupported && <Alert tone="warning">Dieses System ist weder Ubuntu noch Debian. Der Assistent kann trotzdem funktionieren, ist dafür aber nicht getestet.</Alert>}
      </Step>

      <Step n={2} title="Neuen Benutzer anlegen" done={step > 2} active={step === 2}>
        <p className="text-sm text-muted">
          Arbeite nicht dauerhaft als root. Ein eigener Benutzer mit sudo ist sicherer und nachvollziehbarer.{" "}
          <Link href="/lernen/benutzer-ubuntu-debian/warum-nicht-root" className="text-primary hover:underline">
            Warum?
          </Link>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="wiz-new" label="Benutzername" value={newUser} disabled={step !== 2} onChange={(e) => setNewUser(e.target.value.trim().toLowerCase())} placeholder="anna" />
          <div className="pt-6">
            <Checkbox label="Darf sudo nutzen (Gruppe sudo)" checked={sudo} disabled={step !== 2} onChange={(e) => setSudo(e.target.checked)} />
          </div>
        </div>
        {validUser && <Preview script={createUser({ user: newUser, sudo }).script} />}
        {step === 2 && (
          <Button type="button" disabled={busy || !validUser} onClick={() => void run(2, () => wizardCreateUser({ ...base, newUser, sudo }), sudo ? 3 : 4)}>
            Benutzer anlegen
          </Button>
        )}
        <Output text={outputs[2] ?? ""} />
      </Step>

      {sudo && (
        <Step n={3} title="sudo-Zugang festlegen" done={step > 3} active={step === 3}>
          <p className="text-sm text-muted">Der neue Benutzer hat noch kein Passwort. Ohne Passwort kann er sudo nur mit einer NOPASSWD-Regel nutzen.</p>
          <SelectField id="wiz-sudo" label="Variante" value={sudoMode} disabled={step !== 3} onChange={(e) => setSudoMode(e.target.value as "password" | "nopasswd")}>
            <option value="password">Passwort setzen, sudo fragt danach (empfohlen)</option>
            <option value="nopasswd">sudo ohne Passwort (bequem, aber riskanter)</option>
          </SelectField>
          {step === 3 && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const pw = String(f.get("pw1") ?? "");
                if (sudoMode === "password" && pw !== f.get("pw2")) return setError("Die Passwörter stimmen nicht überein.");
                void run(3, () => wizardSudoAccess({ ...base, newUser, sudoMode, newPassword: pw }), 4);
              }}
            >
              {sudoMode === "password" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="wiz-pw1" name="pw1" type="password" label={`Passwort für ${newUser}`} minLength={12} required autoComplete="new-password" hint="Mindestens 12 Zeichen. Wird nur an den Server übergeben, nie gespeichert." />
                  <Field id="wiz-pw2" name="pw2" type="password" label="Wiederholen" required autoComplete="new-password" />
                </div>
              )}
              <Preview script={(sudoMode === "password" ? setUserPassword({ user: newUser }) : allowPasswordlessSudo({ user: newUser })).script} />
              <Button type="submit" disabled={busy}>
                Übernehmen
              </Button>
            </form>
          )}
          <Output text={outputs[3] ?? ""} />
        </Step>
      )}

      <Step n={4} title="SSH-Key hinterlegen" done={step > 4} active={step === 4}>
        {keys.length === 0 ? (
          <Alert tone="warning">
            Du hast noch keinen Key.{" "}
            <Link href="/dashboard/keys/neu" className="underline">
              Erzeuge zuerst einen
            </Link>{" "}
            (am besten im Tresor, dann kann der Assistent die Anmeldung automatisch testen).
          </Alert>
        ) : (
          <>
            <SelectField id="wiz-key" label="Key" value={keyId} disabled={step !== 4} onChange={(e) => setKeyId(e.target.value)}>
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} {k.vault ? "(Tresor)" : ""}
                </option>
              ))}
            </SelectField>
            {key && validUser && <Preview script={deployKey({ user: newUser, publicKeyLine: key.publicKey, asRoot: true }).script} />}
            {step === 4 && (
              <Button type="button" disabled={busy || !key} onClick={() => void run(4, () => wizardDeployKey({ ...base, newUser, keyId }), 5, (r) => setTested(Boolean((r as unknown as { verified?: boolean }).verified)))}>
                Key eintragen
              </Button>
            )}
          </>
        )}
        <Output text={outputs[4] ?? ""} />
      </Step>

      <Step n={5} title="Anmeldung testen" done={step > 5} active={step === 5}>
        {key?.vault ? (
          <>
            <p className="text-sm text-muted">Die Plattform meldet sich mit deinem Tresor-Key als {newUser} an und prüft sudo.</p>
            {step === 5 && (
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(5, () => wizardTestLogin({ serverId: server.id, newUser, keyId }), 6, (r) => {
                    const p = (r as unknown as { privileges: Privileges }).privileges;
                    setTested(true);
                    if (sudo && !p.groups.includes("sudo")) setError("Anmeldung klappt, aber der Benutzer ist nicht in der Gruppe sudo.");
                  })
                }
              >
                Jetzt testen
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm">Teste die Anmeldung selbst von deinem Rechner (in einem neuen Terminal):</p>
            <CodeBlock>{`ssh ${server.port !== 22 ? `-p ${server.port} ` : ""}${newUser || "benutzer"}@SERVER\nsudo -v   # prüft, ob sudo funktioniert`}</CodeBlock>
            <Checkbox label={`Ich konnte mich als ${newUser} anmelden${sudo ? " und sudo nutzen" : ""}.`} checked={manualConfirm} disabled={step !== 5} onChange={(e) => setManualConfirm(e.target.checked)} />
            {step === 5 && (
              <Button type="button" disabled={!manualConfirm} onClick={() => setStep(6)}>
                Weiter
              </Button>
            )}
          </>
        )}
        <Output text={outputs[5] ?? ""} />
      </Step>

      <Step n={6} title="Server absichern (optional)" done={step > 6} active={step === 6}>
        <Alert tone="warning">
          Wenn du jetzt den Passwort-Login abschaltest und dein Key nicht funktioniert, kommst du nicht mehr per SSH auf den Server.
          {tested || manualConfirm ? " Die Anmeldung mit dem Key wurde geprüft." : ""}
        </Alert>
        <Checkbox label="Root-Login per SSH verbieten" checked={disableRoot} disabled={step !== 6} onChange={(e) => setDisableRoot(e.target.checked)} />
        <Checkbox label="Passwort-Login abschalten (nur noch Keys)" checked={disablePassword} disabled={step !== 6} onChange={(e) => setDisablePassword(e.target.checked)} />
        <Preview script={applySshdConfig({ config: sshdConfig }).script} />
        {step === 6 && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !(tested || manualConfirm)}
              onClick={() => void run(6, () => wizardHarden({ ...base, newUser, disableRoot, disablePassword, confirmed: tested || manualConfirm }), 7)}
            >
              Konfiguration anwenden
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep(7)}>
              Überspringen
            </Button>
          </div>
        )}
        <Output text={outputs[6] ?? ""} />
      </Step>

      {step === 7 && (
        <Alert>
          Fertig! Melde dich ab jetzt als <strong>{newUser}</strong> an.{" "}
          <Link href={`/dashboard/server/${server.id}`} className="underline">
            Zurück zum Server
          </Link>
        </Alert>
      )}
    </div>
  );
}
