"use client";
import { useState } from "react";
import { CodeBlock } from "@/components/lernen/code-block";
import { Alert } from "@/components/ui/alert";
import { buildSshdConfig, DEFAULT_SSHD_OPTIONS, sshdApplySteps, SSHD_DROPIN_PATH, type SshdOptions } from "@/lib/tools/sshd-config";
import { Checkbox, inputClass, Labeled } from "./inputs";

const splitNames = (v: string) => v.split(/[\s,]+/).filter(Boolean);

export function SshdConfigurator() {
  const [o, setO] = useState<SshdOptions>(DEFAULT_SSHD_OPTIONS);
  const set = <K extends keyof SshdOptions>(k: K, v: SshdOptions[K]) => setO((p) => ({ ...p, [k]: v }));
  const { config, warnings } = buildSshdConfig(o);
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <form className="space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={(e) => e.preventDefault()}>
        <Labeled label="Root-Login" htmlFor="sc-root">
          <select
            id="sc-root"
            className={inputClass}
            value={o.rootLogin}
            onChange={(e) => set("rootLogin", e.target.value as SshdOptions["rootLogin"])}
          >
            <option value="no">Verboten (empfohlen)</option>
            <option value="prohibit-password">Nur mit Key</option>
            <option value="yes">Erlaubt, auch mit Passwort</option>
          </select>
        </Labeled>
        <Checkbox
          label="Passwort-Login erlauben"
          hint="Erst abschalten, wenn der Key-Login funktioniert."
          checked={o.passwordAuth}
          onChange={(e) => set("passwordAuth", e.target.checked)}
        />
        <Labeled label="Port" htmlFor="sc-port" hint="Ein anderer Port reduziert Log-Rauschen, ist aber kein echter Schutz.">
          <input id="sc-port" type="number" className={inputClass} value={o.port} onChange={(e) => set("port", num(e.target.value, 1, 65535))} />
        </Labeled>
        <Labeled label="Nur diese Benutzer (optional)" htmlFor="sc-users" hint="Mit Leerzeichen oder Komma getrennt.">
          <input id="sc-users" className={inputClass} onChange={(e) => set("allowUsers", splitNames(e.target.value))} />
        </Labeled>
        <Labeled label="Nur diese Gruppen (optional)" htmlFor="sc-groups" hint="z. B. ssh-users">
          <input id="sc-groups" className={inputClass} onChange={(e) => set("allowGroups", splitNames(e.target.value))} />
        </Labeled>
        <Labeled label="Anmeldeversuche pro Verbindung" htmlFor="sc-tries">
          <input id="sc-tries" type="number" className={inputClass} value={o.maxAuthTries} onChange={(e) => set("maxAuthTries", num(e.target.value, 1, 10))} />
        </Labeled>
        <Checkbox label="Port-Weiterleitung erlauben" hint="Für Tunnel nötig." checked={o.tcpForwarding} onChange={(e) => set("tcpForwarding", e.target.checked)} />
        <Checkbox label="Agent-Forwarding erlauben" checked={o.agentForwarding} onChange={(e) => set("agentForwarding", e.target.checked)} />
        <Checkbox label="X11-Weiterleitung erlauben" hint="Grafische Programme, auf Servern selten gebraucht." checked={o.x11Forwarding} onChange={(e) => set("x11Forwarding", e.target.checked)} />
        <Checkbox label="Nur moderne Verschlüsselung" checked={o.modernCrypto} onChange={(e) => set("modernCrypto", e.target.checked)} />
      </form>

      <div className="min-w-0 space-y-5">
        {warnings.map((w) => (
          <Alert key={w.text} tone={w.level === "danger" ? "error" : "warning"}>
            {w.text}
          </Alert>
        ))}
        <section className="space-y-2">
          <h2 className="font-semibold">{SSHD_DROPIN_PATH}</h2>
          <CodeBlock>{config}</CodeBlock>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">So wendest du sie an</h2>
          <p className="text-sm text-muted">
            Dateien in <code className="font-mono">sshd_config.d</code> gelten vor der Hauptdatei. Steht dort schon ein
            Eintrag mit kleinerer Nummer (z. B. <code className="font-mono">50-cloud-init.conf</code> mit
            PasswordAuthentication yes), gewinnt der zuerst gelesene Wert.
          </p>
          <CodeBlock>{sshdApplySteps(o.port).join("\n")}</CodeBlock>
        </section>
      </div>
    </div>
  );
}
