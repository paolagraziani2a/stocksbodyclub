"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormPill } from "@/components/form-button";
import { pillStyles } from "@/components/pill";
import { cn } from "@/components/ui";
import { bookSession, cancelMyBooking, joinWaitlist, leaveWaitlist } from "@/lib/account-actions";

type State = "guest" | "open" | "full" | "booked" | "waiting";

/** Bouton d'action d'un cours du planning, avec retour immédiat (succès, erreur, plus de crédit). */
export function SessionAction({ state, sessionId, bookingId, late }: {
  state: State; sessionId: string; bookingId?: string; late?: boolean;
}) {
  const action = state === "booked" ? cancelMyBooking : state === "waiting" ? leaveWaitlist : state === "full" ? joinWaitlist : bookSession;
  const [result, formAction] = useActionState(action, null);

  if (state === "guest") {
    return <Link href="/connexion?suite=/planning" className={cn(pillStyles.dark, "px-4 py-2.5")}>Réserver</Link>;
  }
  const noCredits = result?.message === "NO_CREDITS";

  return (
    <form
      action={formAction}
      className="flex flex-col items-end gap-1.5"
      onSubmit={(e) => {
        if (state === "booked" && !window.confirm(late
          ? "Annulation tardive : votre crédit ne sera pas rendu. Annuler quand même ?"
          : "Annuler cette réservation ? Votre crédit vous sera rendu.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="session" value={sessionId} />
      {bookingId && <input type="hidden" name="booking" value={bookingId} />}
      {state === "booked" ? (
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-taupe">✓ Réservé</span>
          <FormPill tone="outline" className="px-3.5 py-2">Annuler</FormPill>
        </span>
      ) : state === "waiting" ? (
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">En attente</span>
          <FormPill tone="outline" className="px-3.5 py-2">Quitter</FormPill>
        </span>
      ) : (
        <FormPill tone={state === "full" ? "outline" : "dark"} className="px-4 py-2.5">
          {state === "full" ? "Liste d'attente" : "Réserver"}
        </FormPill>
      )}
      {result?.message && (
        <p role="status" className={cn("max-w-[220px] text-right text-xs", result.ok ? "text-taupe" : "text-danger")}>
          {noCredits
            ? <>Plus de crédit disponible. <Link href="/compte/cartes" className="underline underline-offset-2">Choisir une carte</Link></>
            : result.message}
        </p>
      )}
    </form>
  );
}
