/**
 * Traduction des codes d'erreur métier (levés par les fonctions SQL) en messages clairs.
 */
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Connectez-vous pour continuer.",
  FORBIDDEN: "Vous n'avez pas accès à cette action.",
  SESSION_NOT_FOUND: "Ce cours n'existe plus.",
  SESSION_CANCELLED: "Ce cours a été annulé.",
  SESSION_STARTED: "Ce cours a déjà commencé.",
  SESSION_FULL: "Ce cours est complet. Inscrivez-vous sur la liste d'attente.",
  SESSION_NOT_FULL: "Il reste des places : vous pouvez réserver directement.",
  BOOKING_NOT_OPEN: "Les réservations pour ce cours ne sont pas encore ouvertes.",
  ALREADY_BOOKED: "Vous êtes déjà inscrite à ce cours.",
  ALREADY_ON_WAITLIST: "Vous êtes déjà sur la liste d'attente.",
  NO_CREDITS: "Vous n'avez plus de crédit disponible. Choisissez une carte pour réserver.",
  BOOKING_NOT_FOUND: "Réservation introuvable.",
  BOOKING_NOT_ACTIVE: "Cette réservation n'est plus active.",
  USER_NOT_FOUND: "Compte introuvable.",
  PRODUCT_NOT_AVAILABLE: "Cette carte n'est plus disponible.",
  WAITLIST_DISABLED: "La liste d'attente n'est pas disponible.",
  TOO_EARLY: "Le pointage ouvre une heure avant le cours.",
  NOTE_REQUIRED: "Merci d'indiquer un motif.",
  INVALID_CREDITS: "Nombre de crédits invalide.",
  REFUND_EXCEEDS_PAYMENT: "Le remboursement dépasse le montant payé.",
  ORDER_NOT_REFUNDABLE: "Cette commande ne peut pas être remboursée.",
  PRODUCT_LIMIT_REACHED: "Vous avez déjà profité de cette offre.",
  LATE_CANCEL_LIMIT: "Vous avez atteint la limite d'annulations tardives consécutives : cette réservation ne peut plus être annulée. Contactez le studio.",
  CANNOT_DEMOTE_SELF: "Vous ne pouvez pas retirer votre propre accès administrateur.",
};

export const GENERIC_ERROR = "Une erreur est survenue. Réessayez dans un instant.";

/** Accepte une erreur Supabase/PostgREST, une Error ou un code brut. */
export function errorMessage(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : (error as { message?: string } | null)?.message ?? "";
  const code = raw.trim().split(/[\s:]/)[0];
  return MESSAGES[code] ?? GENERIC_ERROR;
}

export function errorCode(error: unknown): string | null {
  const raw = (error as { message?: string } | null)?.message ?? (typeof error === "string" ? error : "");
  const code = raw.trim().split(/[\s:]/)[0];
  return code in MESSAGES ? code : null;
}
