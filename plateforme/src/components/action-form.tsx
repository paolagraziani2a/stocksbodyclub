"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/auth";
import { buttonStyles, cn } from "./ui";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** Formulaire relié à une Server Action, avec message de succès / d'erreur. */
export function ActionForm({
  action, children, className, confirm,
}: { action: Action; children: ReactNode; className?: string; confirm?: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
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
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn(buttonStyles[variant], className)}>
      {pending ? "…" : children}
    </button>
  );
}
