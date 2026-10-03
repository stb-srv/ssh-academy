"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { PocketIdButton } from "../auth/pocket-id-button";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

export function ConnectedAccounts({
  providerName,
  accountId,
  canUnlink,
  groups,
  syncedAt,
}: {
  providerName: string;
  accountId: string | null;
  canUnlink: boolean;
  groups: string[];
  syncedAt: string | null;
}) {
  const router = useRouter();

  async function unlink() {
    if (!window.confirm(`${providerName} wirklich trennen?`)) return;
    if (!accountId) return;
    await authClient.unlinkAccount({ accountId });
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{providerName}</h2>
        <p className="text-sm text-muted">
          Melde dich mit deinem bestehenden {providerName}-Konto an. Gruppen aus {providerName} können
          automatisch Teams und Rollen zugeordnet werden.
        </p>
      </div>
      {accountId ? (
        <div className="space-y-3 text-sm">
          <p>
            <span className="font-medium text-primary">Verbunden.</span>{" "}
            {syncedAt && <>Zuletzt abgeglichen am {new Date(syncedAt).toLocaleString("de-DE")}.</>}
          </p>
          {groups.length > 0 && (
            <p>
              Gruppen:{" "}
              {groups.map((g) => (
                <code key={g} className="mr-1 rounded bg-border/50 px-1.5 py-0.5 font-mono text-xs">
                  {g}
                </code>
              ))}
            </p>
          )}
          {canUnlink ? (
            <Button variant="secondary" onClick={unlink}>
              Trennen
            </Button>
          ) : (
            <p className="text-muted">
              {providerName} ist dein einziger Login-Weg. Richte zuerst einen Passkey ein, bevor du trennst.
            </p>
          )}
        </div>
      ) : (
        <div className="max-w-xs">
          <PocketIdButton name={providerName} next="/dashboard/sicherheit" mode="link" />
        </div>
      )}
    </Card>
  );
}
