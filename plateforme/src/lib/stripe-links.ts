import "server-only";

/** Liens vers le tableau de bord Stripe (mode test tant que la clé est sk_test_). */
export function stripeDashboardBase(): string {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return key.startsWith("sk_live_") || key.startsWith("rk_live_")
    ? "https://dashboard.stripe.com"
    : "https://dashboard.stripe.com/test";
}

export const stripeLinks = () => {
  const base = stripeDashboardBase();
  return {
    payments: `${base}/payments`,
    payment: (pi: string) => `${base}/payments/${encodeURIComponent(pi)}`,
    coupons: `${base}/coupons`,
    payouts: `${base}/payouts`,
    balance: `${base}/balance/overview`,
  };
};
