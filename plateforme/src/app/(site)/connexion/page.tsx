import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AuthField, AuthShell } from "@/components/auth-shell";
import { FormPill } from "@/components/form-button";
import { signIn } from "@/lib/account-actions";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  const { suite, lien, mdp } = await searchParams;
  const next = typeof suite === "string" ? suite : "";
  return (
    <AuthShell
      n="00" label="Mon compte" main="Bon" accent="retour."
      intro="Connectez-vous avec votre email et votre mot de passe pour réserver vos cours et suivre vos cartes."
      footer={<>Pas encore de compte ? <Link href={`/inscription${next ? `?suite=${encodeURIComponent(next)}` : ""}`} className="text-ink underline underline-offset-4">Créer mon compte</Link></>}
    >
      {mdp && (
        <p role="status" className="mb-5 rounded-xl bg-blush px-4 py-3 text-sm">Votre nouveau mot de passe est enregistré : connectez-vous.</p>
      )}
      {lien === "expire" && (
        <p className="mb-5 rounded-xl bg-blush px-4 py-3 text-sm">Ce lien a expiré ou a déjà été utilisé. Connectez-vous, ou demandez un nouveau lien.</p>
      )}
      <ActionForm action={signIn} className="flex flex-col gap-5">
        <input type="hidden" name="suite" value={next} />
        <AuthField label="Email" name="email" type="email" autoComplete="email" required />
        <AuthField label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
        <Link href="/mot-de-passe-oublie" className="-mt-2 self-end text-xs text-muted underline-offset-4 hover:text-ink hover:underline">Mot de passe oublié ?</Link>
        <FormPill className="w-full">Se connecter →</FormPill>
      </ActionForm>
    </AuthShell>
  );
}
