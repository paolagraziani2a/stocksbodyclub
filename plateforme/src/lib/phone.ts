/**
 * Numéros de téléphone : saisis librement (« 06 12 34 56 78 », « +33 6… », « 0033… »),
 * stockés au format international E.164 (« +33612345678 »).
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let digits = raw.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  // numéro français à 10 chiffres (06…, 07…, 04… ; 0495 en Corse)
  if (/^0[1-9]\d{8}$/.test(digits)) digits = `+33${digits.slice(1)}`;
  if (/^\+33[1-9]\d{8}$/.test(digits)) return digits;
  if (/^\+(?!33)[1-9]\d{7,14}$/.test(digits)) return digits; // autres pays
  return null;
}

/** Affichage : +33612345678 → 06 12 34 56 78 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return fr ? `0${fr[1]} ${fr[2]} ${fr[3]} ${fr[4]} ${fr[5]}` : e164;
}

export function isMobile(e164: string): boolean {
  return !e164.startsWith("+33") || /^\+33[67]/.test(e164);
}
