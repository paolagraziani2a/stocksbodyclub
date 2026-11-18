import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AuthField, AuthShell } from "@/components/auth-shell";
import { FormPill } from "@/components/form-button";
import { requestPasswordReset } from "@/lib/account-actions";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      n="00" label="Mot de passe oublié" main="Pas de" accent="panique."
      intro="Indiquez l'email de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe."
      footer={<Link href="/connexion" className="underline underline-offset-4">← Retour à la connexion</Link>}
    >
      <ActionForm action={requestPasswordReset} className="flex flex-col gap-5">
        <AuthField label="Email" name="email" type="email" autoComplete="email" required />
        <FormPill className="w-full">Recevoir le lien →</FormPill>
      </ActionForm>
    </AuthShell>
  );
}
