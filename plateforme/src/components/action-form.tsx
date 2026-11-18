"use client";

import { createContext, useActionState, useContext, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/auth";
import { buttonStyles, cn } from "./ui";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

const PendingContext = createContext(false);

/** Vrai pendant l'envoi du formulaire englobant. */
export function useFormPending() {
  const ctx = useContext(PendingContext);
  const { pending } = useFormStatus();
  return ctx || pending;
}

/**
 * Formulaire relié à une Server Action, avec message de succès / d'erreur.
 * L'envoi passe par onSubmit (et non `action=`) : React 19 vide sinon tous les
 * champs après chaque envoi, et la cliente perdrait sa saisie à la moindre erreur.
 */
export function ActionForm({
  action, children, className, confirm,
}: { action: Action; children: ReactNode; className?: string; confirm?: string }) {
  const [state, dispatch] = useActionState(action, null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => dispatch(data));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {state?.message && (
        <p role="status" className={cn("mt-3 text-sm", state.ok ? "text-success" : "text-danger")}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children, variant = "primary", className,
}: { children: ReactNode; variant?: keyof typeof buttonStyles; className?: string }) {
  const pending = useFormPending();
  return (
    <button type="submit" disabled={pending} className={cn(buttonStyles[variant], className)}>
      {pending ? "…" : children}
    </button>
  );
}
