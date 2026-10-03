import "server-only";
import { env, pocketIdEnabled } from "./env";

/** Einstellungen, die an Client-Komponenten weitergegeben werden dürfen (keine Secrets!) */
export function getPublicAuthConfig() {
  return {
    localLogin: env.LOCAL_LOGIN_ENABLED,
    registrationOpen: env.LOCAL_LOGIN_ENABLED && env.REGISTRATION_MODE === "open",
    pocketId: pocketIdEnabled ? { name: env.POCKET_ID_DISPLAY_NAME } : null,
  };
}

export type PublicAuthConfig = ReturnType<typeof getPublicAuthConfig>;
