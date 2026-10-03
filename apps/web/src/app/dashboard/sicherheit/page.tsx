import type { Metadata } from "next";
import { ConnectedAccounts } from "@/components/dashboard/connected-accounts";
import { PasskeyManager } from "@/components/dashboard/passkey-manager";
import { TwoFactorSetup } from "@/components/dashboard/two-factor-setup";
import { Alert } from "@/components/ui/alert";
import { authErrorMessage } from "@/lib/auth-errors";
import { getPublicAuthConfig } from "@/lib/public-config";
import { getSecurityOverview } from "@/lib/security";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sicherheit" };

export default async function SecurityPage({ searchParams }: PageProps<"/dashboard/sicherheit">) {
  const session = await requireSession();
  const security = await getSecurityOverview(session.user.id);
  const config = getPublicAuthConfig();
  const params = await searchParams;
  const error = authErrorMessage(typeof params.error === "string" ? params.error : null);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Sicherheit</h1>
      {error && <Alert tone="error">{error}</Alert>}
      <PasskeyManager passkeys={security.passkeys.map((p) => ({ ...p, createdAt: p.createdAt?.toISOString() ?? null }))} />
      <TwoFactorSetup enabled={security.totpEnabled} hasPassword={security.hasPassword} />
      {config.pocketId && (
        <ConnectedAccounts
          providerName={config.pocketId.name}
          accountId={security.pocketIdAccountId}
          canUnlink={security.hasPassword || security.passkeys.length > 0}
          groups={security.pocketIdGroups}
          syncedAt={security.pocketIdSyncedAt?.toISOString() ?? null}
        />
      )}
    </div>
  );
}
