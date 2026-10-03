import "server-only";
import { gatewayEnabled } from "@/lib/env";
import { getVaultPublicKey } from "@/lib/gateway";
import { getSecurityOverview } from "@/lib/security";

/** Tresor-Schlüssel für den Browser, oder warum der Tresor gerade nicht nutzbar ist */
export async function vaultForUser(userId: string) {
  const security = await getSecurityOverview(userId);
  if (!security.strongAuth) return { vault: null, reason: "Für den Tresor brauchst du einen Passkey oder die Zwei-Faktor-Anmeldung." };
  if (!gatewayEnabled) return { vault: null, reason: "Das SSH-Gateway ist nicht eingerichtet (GATEWAY_INTERNAL_TOKEN fehlt)." };
  try {
    return { vault: await getVaultPublicKey(), reason: null };
  } catch {
    return { vault: null, reason: "Das SSH-Gateway ist gerade nicht erreichbar." };
  }
}
