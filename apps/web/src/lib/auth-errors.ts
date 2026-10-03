/** Verständliche Texte für Fehlercodes aus dem Login (Query-Parameter `error`) */
const MESSAGES: Record<string, string> = {
  account_not_linked:
    "Es gibt bereits ein Konto mit dieser E-Mail-Adresse. Melde dich einmal mit deinem bisherigen Zugang an und verbinde Pocket ID danach unter „Sicherheit“.",
  signup_disabled:
    "Für dein Pocket-ID-Konto gibt es hier noch keinen Zugang, und neue Konten werden nicht automatisch angelegt. Bitte wende dich an den Administrator.",
  unable_to_create_user:
    "Das Konto konnte nicht angelegt werden. Eventuell ist dein Pocket-ID-Konto für diese Plattform nicht freigeschaltet.",
  pocket_id_not_allowed:
    "Dein Pocket-ID-Konto ist für diese Plattform nicht freigeschaltet. Bitte wende dich an den Administrator.",
  email_not_verified: "Deine E-Mail-Adresse ist bei Pocket ID nicht bestätigt.",
  state_not_found: "Die Anmeldung ist abgelaufen. Bitte versuche es noch einmal.",
  invalid_callback_request: "Die Anmeldung ist fehlgeschlagen. Bitte versuche es noch einmal.",
  internal_server_error: "Die Anmeldung ist fehlgeschlagen. Bitte versuche es noch einmal.",
};

export function authErrorMessage(code: string | undefined | null) {
  if (!code) return null;
  return MESSAGES[code] ?? "Die Anmeldung ist fehlgeschlagen. Bitte versuche es noch einmal.";
}
