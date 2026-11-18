/** Montants en centimes TTC. Le studio affiche ses prix TTC (TVA 20 %). */

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function formatEuros(cents: number): string {
  return eur.format(Math.round(cents) / 100);
}

/** Part HT d'un montant TTC, en centimes (non arrondi, pour les cumuls). */
export function htFromTtc(ttcCents: number, vatRatePercent: number): number {
  return ttcCents / (1 + vatRatePercent / 100);
}

export function vatFromTtc(ttcCents: number, vatRatePercent: number): number {
  return ttcCents - htFromTtc(ttcCents, vatRatePercent);
}

/** Prix par cours d'une carte, en centimes. */
export function pricePerClass(priceCents: number, credits: number): number {
  return priceCents / credits;
}
