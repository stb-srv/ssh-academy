"use client";
import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "./permissions";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        // Läuft außerhalb einer Komponente, daher kein useRouter möglich.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/zwei-faktor";
      },
    }),
    passkeyClient(),
    organizationClient({ ac, roles }),
    adminClient(),
  ],
});
