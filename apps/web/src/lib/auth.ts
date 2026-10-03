import "server-only";
import { passkey } from "@better-auth/passkey";
import { schema } from "@ssh-academy/db";
import { hash, verify } from "@node-rs/argon2";
import { betterAuth, type AuthContext } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, genericOAuth, haveIBeenPwned, organization, twoFactor } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { db } from "./db";
import { env, POCKET_ID_PROVIDER, pocketIdEnabled } from "./env";
import { sendMail } from "./mail";
import { ac, PLATFORM_ADMIN_ROLE, PLATFORM_USER_ROLE, roles } from "./permissions";
import { audit } from "./audit";
import { extractGroups, readPocketIdGroups, syncPocketIdGroups } from "./pocket-id";

const appUrl = new URL(env.APP_URL);

// Argon2id-Parameter nach OWASP-Empfehlung (19 MiB, 2 Iterationen)
const argon2Options = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const auth = betterAuth({
  appName: env.APP_NAME,
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),

  emailAndPassword: {
    enabled: env.LOCAL_LOGIN_ENABLED,
    // Ohne Mailserver kann niemand seine Adresse bestätigen, daher nur mit SMTP verpflichtend.
    requireEmailVerification: Boolean(env.SMTP_URL),
    minPasswordLength: 12,
    maxPasswordLength: 256,
    password: {
      hash: (password) => hash(password, argon2Options),
      verify: ({ hash: hashed, password }) => verify(hashed, password),
    },
    sendResetPassword: async ({ user, url }) => {
      await sendMail(
        user.email,
        "Passwort zurücksetzen",
        `Hallo ${user.name},\n\nüber diesen Link kannst du ein neues Passwort setzen:\n${url}\n\nWenn du das nicht angefordert hast, ignoriere diese Mail.`,
      );
    },
  },

  emailVerification: {
    sendOnSignUp: Boolean(env.SMTP_URL),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(
        user.email,
        "Bitte bestätige deine E-Mail-Adresse",
        `Hallo ${user.name},\n\nbitte bestätige deine E-Mail-Adresse:\n${url}`,
      );
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    additionalFields: {
      /** Wie die Sitzung entstanden ist, z. B. "pocket-id" (für die kürzere Höchstdauer) */
      loginMethod: { type: "string", required: false, input: false },
    },
  },

  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      // Standard: bestehende Konten werden NICHT stillschweigend über die E-Mail verknüpft.
      // Nutzer verbinden Pocket ID bewusst in den Einstellungen (linkSocial), während sie angemeldet sind.
      disableImplicitLinking: !env.POCKET_ID_AUTO_LINK_BY_EMAIL,
      trustedProviders: env.POCKET_ID_AUTO_LINK_BY_EMAIL ? [POCKET_ID_PROVIDER] : [],
    },
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/two-factor/verify-totp": { window: 60, max: 5 },
    },
  },

  advanced: {
    useSecureCookies: appUrl.protocol === "https:",
    database: { generateId: () => crypto.randomUUID() },
  },

  databaseHooks: {
    // Pocket-ID-Gruppen abgleichen: beim ersten Login bzw. Verknüpfen (create)
    // und bei jedem weiteren Login, wenn Better Auth die Tokens aktualisiert (update).
    account: {
      create: {
        after: async (account, ctx) => {
          if (account.providerId === POCKET_ID_PROVIDER && ctx) await syncFromAccount(ctx.context, account.userId);
        },
      },
      update: {
        after: async (account, ctx) => {
          if (account.providerId === POCKET_ID_PROVIDER && ctx) await syncFromAccount(ctx.context, account.userId);
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          await audit({
            action: "auth.login",
            actorId: session.userId,
            ip: session.ipAddress,
            userAgent: session.userAgent,
          });
        },
      },
    },
    user: {
      create: {
        before: async (user, ctx) => {
          const existing = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
          const isFirstUser = existing.length === 0;

          if (!isFirstUser && ctx?.path === "/sign-up/email" && env.REGISTRATION_MODE === "closed") {
            throw new APIError("FORBIDDEN", {
              message: "Die Registrierung ist geschlossen. Bitte wende dich an den Administrator.",
            });
          }

          // Der allererste Nutzer wird Plattform-Admin.
          return {
            data: { ...user, role: isFirstUser ? PLATFORM_ADMIN_ROLE : PLATFORM_USER_ROLE },
          };
        },
      },
    },
  },

  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith("/callback") || ctx.params?.id !== POCKET_ID_PROVIDER) return;
      const newSession = ctx.context.newSession;
      if (!newSession) return;

      // Sitzungen aus einem Pocket-ID-Login sind kürzer gültig (siehe lib/session.ts), damit in
      // Pocket ID deaktivierte Nutzer spätestens nach dieser Zeit den Zugang verlieren.
      await ctx.context.internalAdapter.updateSession(newSession.session.token, {
        loginMethod: POCKET_ID_PROVIDER,
      });
    }),
  },

  plugins: [
    admin({
      roles: { [PLATFORM_ADMIN_ROLE]: adminAc, [PLATFORM_USER_ROLE]: userAc },
      defaultRole: PLATFORM_USER_ROLE,
      adminRoles: [PLATFORM_ADMIN_ROLE],
    }),
    organization({
      ac,
      roles,
      creatorRole: "owner",
      allowUserToCreateOrganization: true,
      sendInvitationEmail: async ({ email, organization: org, inviter, id }) => {
        await sendMail(
          email,
          `Einladung zum Team ${org.name}`,
          `${inviter.user.name} hat dich in das Team "${org.name}" eingeladen.\n\n${env.APP_URL}/einladung/${id}`,
        );
      },
    }),
    twoFactor({ issuer: env.APP_NAME }),
    passkey({ rpID: appUrl.hostname, rpName: env.APP_NAME, origin: appUrl.origin }),
    haveIBeenPwned({
      enabled: env.PASSWORD_BREACH_CHECK,
      customPasswordCompromisedMessage:
        "Dieses Passwort ist aus Datenlecks bekannt. Bitte wähle ein anderes.",
    }),
    ...(pocketIdEnabled
      ? [
          genericOAuth({
            config: [
              {
                providerId: POCKET_ID_PROVIDER,
                name: env.POCKET_ID_DISPLAY_NAME,
                discoveryUrl: `${env.POCKET_ID_URL!.replace(/\/$/, "")}/.well-known/openid-configuration`,
                requireIdTokenVerification: true,
                clientId: env.POCKET_ID_CLIENT_ID!,
                clientSecret: env.POCKET_ID_CLIENT_SECRET!,
                scopes: ["openid", "profile", "email", "groups"],
                pkce: true,
                disableSignUp: !env.POCKET_ID_AUTO_PROVISION,
                mapProfileToUser: (profile) => {
                  const allowed = env.POCKET_ID_ALLOWED_GROUPS;
                  if (allowed.length > 0) {
                    const groups = extractGroups(profile);
                    if (!groups.some((g) => allowed.includes(g))) {
                      // Zurück zur Login-Seite mit verständlicher Meldung statt JSON-Fehler
                      throw new APIError("FOUND", undefined, {
                        location: `${env.APP_URL}/anmelden?error=pocket_id_not_allowed`,
                      });
                    }
                  }
                  return {
                    name:
                      (profile.name as string | undefined) ??
                      (profile.preferred_username as string | undefined) ??
                      String(profile.email),
                  };
                },
              },
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
});

async function syncFromAccount(context: AuthContext, userId: string) {
  const groups = await readPocketIdGroups(context, userId);
  if (!groups) return;
  await syncPocketIdGroups(userId, groups);
  await audit({ action: "pocket_id.groups_synced", actorId: userId, metadata: { groups } });
}

export type Session = typeof auth.$Infer.Session;
