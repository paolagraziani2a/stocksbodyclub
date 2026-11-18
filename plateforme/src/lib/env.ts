/**
 * Variables d'environnement.
 * Seules les NEXT_PUBLIC_* sont visibles dans le navigateur : n'y mettre AUCUN secret.
 */
export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

/** Secrets serveur — chacun lu seulement quand il sert, jamais exposé au navigateur. */
export function serverEnv() {
  return {
    get databaseUrl() { return required("DATABASE_URL"); },
    get authSecret() { return required("BETTER_AUTH_SECRET"); },
    get stripeSecretKey() { return required("STRIPE_SECRET_KEY"); },
    get stripeWebhookSecret() { return required("STRIPE_WEBHOOK_SECRET"); },
    get cronSecret() { return required("CRON_SECRET"); },
  };
}
