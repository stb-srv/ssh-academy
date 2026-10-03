import "server-only";
import { isValidLinuxUser } from "@ssh-academy/ssh/ops";
import { connectableKeys, mayConnectAs, type ServerAccess } from "./access";
import { ActionError } from "./guard";
import type { OpAuth } from "./server-ops";

/** Formularwerte von <AuthFields> lesen */
export function parseOpAuth(form: FormData | Record<string, unknown>): OpAuth {
  const get = (k: string) => String((form instanceof FormData ? form.get(k) : form[k]) ?? "");
  const auth = get("auth");
  const sudoPassword = get("sudoPassword") || undefined;
  if (auth === "management") return { method: "management", sudoPassword };
  if (auth.startsWith("key:")) {
    const [, keyId = "", username = ""] = auth.split(":");
    return { method: "key", keyId, username, sudoPassword };
  }
  const username = get("username").trim();
  if (!isValidLinuxUser(username)) throw new ActionError("Bitte einen gültigen Linux-Benutzernamen angeben.");
  return { method: "password", username, password: get("password"), sudoPassword };
}

export type AuthOption = { value: string; label: string; username: string | null };

/** Welche Anmeldewege der Nutzer für diesen Server hat (für das Formular) */
export async function authOptions(userId: string, access: ServerAccess): Promise<AuthOption[]> {
  const options: AuthOption[] = [];
  const keys = await connectableKeys(userId, access.server.id);
  for (const k of keys) {
    if (mayConnectAs(access, k.linuxUser)) options.push({ value: `key:${k.key.id}:${k.linuxUser}`, label: `Tresor-Key „${k.key.name}“ als ${k.linuxUser}`, username: k.linuxUser });
  }
  if (access.canManage && access.server.managementKeyId && !options.some((o) => o.value.startsWith(`key:${access.server.managementKeyId}:${access.server.defaultUser}`))) {
    options.push({ value: "management", label: `Verwaltungs-Key als ${access.server.defaultUser}`, username: access.server.defaultUser });
  }
  options.push({ value: "password", label: "Mit Passwort (wird nicht gespeichert)", username: null });
  return options;
}
