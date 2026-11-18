import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { AuthField, AuthShell } from "@/components/auth-shell";
import { FormPill } from "@/components/form-button";
import { updatePassword } from "@/lib/account-actions";

export const metadata: Metadata = { title: "Nouveau mot de passe", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reinitialiser">) {
  const { temporaire } = await searchParams;
  return (
    <AuthShell
      n="00" label="Sécurité" main="Nouveau" accent="mot de passe."
      intro={temporaire
        ? "Vous vous êtes connectée avec un mot de passe temporaire donné par le studio : choisissez maintenant le vôtre."
        : "Choisissez un mot de passe que vous n'utilisez pas ailleurs."}
    >
      <ActionForm action={updatePassword} className="flex flex-col gap-5">
        <AuthField label="Nouveau mot de passe" name="password" type="password" autoComplete="new-password" required minLength={8}
          hint="8 caractères minimum, avec des lettres et des chiffres" />
        <AuthField label="Confirmer" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        <FormPill className="w-full">Enregistrer →</FormPill>
      </ActionForm>
    </AuthShell>
  );
}
