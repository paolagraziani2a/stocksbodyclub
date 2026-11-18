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

/** Secrets serveur — lus à la demande, jamais exposés au navigateur. */
export function serverEnv() {
  return {
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    stripeSecretKey: required("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    cronSecret: required("CRON_SECRET"),
  };
}
