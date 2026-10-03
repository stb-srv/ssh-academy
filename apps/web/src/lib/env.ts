import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  APP_NAME: z.string().default("SSH-Academy"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET muss mindestens 32 Zeichen lang sein"),

  /** open: jeder darf sich registrieren · closed: nur der erste Nutzer (Admin) und SSO-Nutzer */
  REGISTRATION_MODE: z.enum(["open", "closed"]).default("closed"),
  /** Lokaler Login mit E-Mail und Passwort (aus = nur Pocket ID) */
  LOCAL_LOGIN_ENABLED: bool.default(true),

  /** Passwörter gegen bekannte Datenlecks prüfen (Have I Been Pwned, k-Anonymity) */
  PASSWORD_BREACH_CHECK: bool.default(true),

  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("SSH-Academy <noreply@localhost>"),

  POCKET_ID_URL: z.url().optional(),
  POCKET_ID_CLIENT_ID: z.string().optional(),
  POCKET_ID_CLIENT_SECRET: z.string().optional(),
  POCKET_ID_DISPLAY_NAME: z.string().default("Pocket ID"),
  /** Neue Konten beim ersten Pocket-ID-Login automatisch anlegen */
  POCKET_ID_AUTO_PROVISION: bool.default(true),
  /** Kommagetrennte Pocket-ID-Gruppen, die sich anmelden dürfen (leer = alle) */
  POCKET_ID_ALLOWED_GROUPS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((g) => g.trim()).filter(Boolean) : [])),
  /** Bestehende lokale Konten automatisch über verifizierte E-Mail verknüpfen (unsicherer, Standard aus) */
  POCKET_ID_AUTO_LINK_BY_EMAIL: bool.default(false),
  /** Höchstdauer einer Sitzung aus einem Pocket-ID-Login, gerechnet ab dem Login */
  POCKET_ID_MAX_SESSION_HOURS: z.coerce.number().int().min(1).max(720).default(12),
});

export type Env = z.infer<typeof schema>;

// Während `next build` gibt es noch keine echte Konfiguration (z. B. im Docker-Build).
// Dann gelten Platzhalter; zur Laufzeit wird die echte Konfiguration streng geprüft.
const BUILD_PLACEHOLDERS = {
  DATABASE_URL: "postgres://build:build@localhost:5432/build",
  BETTER_AUTH_SECRET: "build-time-placeholder-secret-0000000000",
};

function load(): Env {
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const parsed = schema.safeParse(isBuild ? { ...BUILD_PLACEHOLDERS, ...process.env } : process.env);
  if (!parsed.success) {
    throw new Error(`Ungültige Konfiguration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const env = load();

export const pocketIdEnabled = Boolean(
  env.POCKET_ID_URL && env.POCKET_ID_CLIENT_ID && env.POCKET_ID_CLIENT_SECRET,
);

export const POCKET_ID_PROVIDER = "pocket-id";
