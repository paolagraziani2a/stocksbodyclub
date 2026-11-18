import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { PostgresDialect } from "kysely";
import { asService, authPool } from "./db";
import { emails, sendEmail } from "./email";

const ts = { createdAt: "created_at", updatedAt: "updated_at" } as const;

/** Correspondance champs Better Auth → colonnes de la base (snake_case). */
export const AUTH_SCHEMA = {
  user: {
    modelName: "users",
    fields: { emailVerified: "email_verified", ...ts },
    additionalFields: {
      firstName: { type: "string", required: false, input: true, fieldName: "first_name" },
      lastName: { type: "string", required: false, input: true, fieldName: "last_name" },
      phone: { type: "string", required: false, input: true },
      smsOptIn: { type: "boolean", required: false, input: true, fieldName: "sms_opt_in" },
      termsAccepted: { type: "boolean", required: false, input: true, fieldName: "terms_accepted" },
    },
  },
  session: {
    modelName: "sessions",
    fields: { userId: "user_id", expiresAt: "expires_at", ipAddress: "ip_address", userAgent: "user_agent", ...ts },
  },
  account: {
    modelName: "accounts",
    fields: {
      userId: "user_id", accountId: "account_id", providerId: "provider_id", accessToken: "access_token",
      refreshToken: "refresh_token", idToken: "id_token", accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at", ...ts,
    },
  },
  verification: { modelName: "verifications", fields: { expiresAt: "expires_at", ...ts } },
} as const;

/**
 * Comptes clientes : email + mot de passe (Better Auth, open source).
 * Les comptes vivent dans la base Neon (schéma « auth ») ; les mots de passe sont
 * stockés sous forme d'empreinte (scrypt) et ne peuvent jamais être relus.
 */
function createAuth() {
  return betterAuth({
    appName: "The Body Club",
    baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET,
    database: { dialect: new PostgresDialect({ pool: authPool() }), type: "postgres", schemaName: "auth" },
    advanced: { database: { generateId: "uuid" } },
    user: { ...AUTH_SCHEMA.user, additionalFields: { ...AUTH_SCHEMA.user.additionalFields } },
    session: { ...AUTH_SCHEMA.session, expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    account: AUTH_SCHEMA.account,
    verification: AUTH_SCHEMA.verification,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 72,
      // confirmation de l'email obligatoire en production (désactivable pour les tests locaux)
      requireEmailVerification: process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false",
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      // la cliente a choisi son propre mot de passe : fin du mot de passe temporaire
      onPasswordReset: async ({ user }) => {
        await asService((tx) => tx.run("update public.profiles set must_change_password = false where id = $1", [user.id]));
      },
      sendResetPassword: async ({ user, url }) => {
        const m = emails.reset(url);
        await sendEmail({ to: user.email, userId: user.id, kind: "password_reset", ...m, link: url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const m = emails.verify(url);
        await sendEmail({ to: user.email, userId: user.id, kind: "email_verification", ...m, link: url });
      },
    },
    rateLimit: { enabled: true, window: 60, max: 30 },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { bodyclubAuth?: Auth };

/** Instance créée à la première utilisation (aucune connexion à la base pendant le build). */
export function auth(): Auth {
  globalForAuth.bodyclubAuth ??= createAuth();
  return globalForAuth.bodyclubAuth;
}
