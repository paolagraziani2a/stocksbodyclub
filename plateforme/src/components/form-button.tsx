"use client";

import type { ReactNode } from "react";
import { useFormPending } from "./action-form";
import { pillStyles } from "./pill";
import { cn } from "./ui";

/** Bouton-pilule de formulaire (désactivé pendant l'envoi). */
export function FormPill({ children, tone = "dark", className }: { children: ReactNode; tone?: keyof typeof pillStyles; className?: string }) {
  const pending = useFormPending();
  return (
    <button type="submit" disabled={pending} className={cn(pillStyles[tone], "disabled:opacity-60", className)}>
      {pending ? "Un instant…" : children}
    </button>
  );
}
