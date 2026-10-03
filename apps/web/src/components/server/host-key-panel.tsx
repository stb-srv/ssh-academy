"use client";
import { checkServer, confirmHostKey } from "@/app/dashboard/server/actions";
import { CodeBlock } from "@/components/lernen/code-block";
import { ActionButton } from "@/components/ui/action-button";
import { Alert } from "@/components/ui/alert";

const KEY_FILES: Record<string, string> = {
  "ssh-ed25519": "/etc/ssh/ssh_host_ed25519_key.pub",
  "ecdsa-sha2-nistp256": "/etc/ssh/ssh_host_ecdsa_key.pub",
  "rsa-sha2-512": "/etc/ssh/ssh_host_rsa_key.pub",
  "rsa-sha2-256": "/etc/ssh/ssh_host_rsa_key.pub",
  "ssh-rsa": "/etc/ssh/ssh_host_rsa_key.pub",
};

export function HostKeyPanel({
  serverId,
  fingerprint,
  keyType,
  confirmed,
  canManage,
  mismatch,
  lastError,
}: {
  serverId: string;
  fingerprint: string | null;
  keyType: string | null;
  confirmed: boolean;
  canManage: boolean;
  mismatch: boolean;
  lastError: string | null;
}) {
  const file = (keyType && KEY_FILES[keyType]) ?? "/etc/ssh/ssh_host_ed25519_key.pub";
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">Host-Key</h2>
      {mismatch && (
        <Alert tone="error">
          <strong>Achtung:</strong> Der Server meldet sich mit einem anderen Schlüssel als bestätigt. Verbindungen sind gesperrt.
          Wurde der Server neu installiert? Wenn nicht, könnte jemand die Verbindung umleiten. {lastError}
        </Alert>
      )}
      <p className="break-all font-mono text-sm">
        {keyType} {fingerprint ?? "noch nicht abgefragt"}
      </p>
      {!confirmed && fingerprint && (
        <>
          <p className="text-sm">
            Vergleiche diesen Fingerprint mit dem, den der Server selbst anzeigt. Öffne dazu die Konsole deines Hosters bzw.
            Proxmox und führe aus:
          </p>
          <CodeBlock>{`ssh-keygen -lf ${file}`}</CodeBlock>
          {canManage ? (
            <ActionButton
              variant="primary"
              action={() => confirmHostKey(serverId, fingerprint)}
              confirm="Stimmt der Fingerprint genau mit der Ausgabe auf dem Server überein?"
            >
              Fingerprint stimmt überein, bestätigen
            </ActionButton>
          ) : (
            <p className="text-sm text-muted">Ein Verwalter des Servers muss den Fingerprint bestätigen.</p>
          )}
        </>
      )}
      <div>
        <ActionButton action={async () => {
          const r = await checkServer(serverId);
          return r.ok ? { ok: true, message: r.message } : r;
        }}>
          Erreichbarkeit und Host-Key prüfen
        </ActionButton>
      </div>
    </section>
  );
}
