/**
 * Variables d'environnement.
 * NEXT_PUBLIC_* sont visibles dans le navigateur : n'y mettre AUCUN secret.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
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
    get supabaseServiceRoleKey() { return required("SUPABASE_SERVICE_ROLE_KEY"); },
    get stripeSecretKey() { return required("STRIPE_SECRET_KEY"); },
    get stripeWebhookSecret() { return required("STRIPE_WEBHOOK_SECRET"); },
    get cronSecret() { return required("CRON_SECRET"); },
  };
}
