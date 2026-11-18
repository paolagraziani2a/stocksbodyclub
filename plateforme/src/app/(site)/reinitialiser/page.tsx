import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AuthField, AuthShell } from "@/components/auth-shell";
import { FormPill } from "@/components/form-button";
import { updatePassword } from "@/lib/account-actions";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Nouveau mot de passe", robots: { index: false } };

/**
 * Deux cas :
 *  - lien « mot de passe oublié » reçu par email : ?token=… (pas besoin d'être connectée) ;
 *  - cliente connectée (changement volontaire ou mot de passe temporaire) : mot de passe actuel demandé.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reinitialiser">) {
  const { temporaire, token, error } = await searchParams;
  const tokenValue = typeof token === "string" ? token : "";

  if (error) {
    return (
      <AuthShell n="00" label="Sécurité" main="Lien" accent="expiré."
        intro="Ce lien n'est plus valable (il expire au bout d'une heure, et ne sert qu'une fois)."
        footer={<Link href="/mot-de-passe-oublie" className="underline underline-offset-4">Recevoir un nouveau lien →</Link>}>
        <p className="text-sm">Demandez un nouveau lien depuis la page « Mot de passe oublié ».</p>
      </AuthShell>
    );
  }
  if (!tokenValue && !(await getSessionUser())) redirect("/connexion?suite=/reinitialiser");

  return (
    <AuthShell
      n="00" label="Sécurité" main="Nouveau" accent="mot de passe."
      intro={temporaire
        ? "Vous vous êtes connectée avec un mot de passe temporaire donné par le studio : choisissez maintenant le vôtre."
        : "Choisissez un mot de passe que vous n'utilisez pas ailleurs."}
    >
      <ActionForm action={updatePassword} className="flex flex-col gap-5">
        {tokenValue
          ? <input type="hidden" name="token" value={tokenValue} />
          : <AuthField label={temporaire ? "Mot de passe temporaire" : "Mot de passe actuel"} name="current" type="password" autoComplete="current-password" required />}
        <AuthField label="Nouveau mot de passe" name="password" type="password" autoComplete="new-password" required minLength={8}
          hint="8 caractères minimum, avec des lettres et des chiffres" />
        <AuthField label="Confirmer" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        <FormPill className="w-full">Enregistrer →</FormPill>
      </ActionForm>
    </AuthShell>
  );
}
