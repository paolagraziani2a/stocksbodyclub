"use client";

import { buttonStyles } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonStyles.secondary}>
      Imprimer / enregistrer en PDF
    </button>
  );
}
