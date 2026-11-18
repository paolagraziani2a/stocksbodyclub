import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AuthField, AuthShell, Check } from "@/components/auth-shell";
import { FormPill } from "@/components/form-button";
import { signUp } from "@/lib/account-actions";

export const metadata: Metadata = { title: "Créer mon compte" };

export default async function SignUpPage({ searchParams }: PageProps<"/inscription">) {
  const { suite } = await searchParams;
  return (
    <AuthShell
      n="00" label="Inscription" main="Créer" accent="mon compte."
      intro={<>Quelques informations et c&apos;est parti. Votre numéro sert uniquement à vous prévenir par SMS si un cours est annulé.</>}
      footer={<>Déjà inscrite ? <Link href="/connexion" className="text-ink underline underline-offset-4">Se connecter</Link></>}
    >
      <ActionForm action={signUp} className="grid gap-5 sm:grid-cols-2">
        <input type="hidden" name="suite" value={typeof suite === "string" ? suite : ""} />
        <AuthField label="Prénom" name="first_name" autoComplete="given-name" required maxLength={60} />
        <AuthField label="Nom" name="last_name" autoComplete="family-name" required maxLength={60} />
        <AuthField label="Email" name="email" type="email" autoComplete="email" required className="sm:col-span-2" />
        <AuthField label="Téléphone mobile" name="phone" type="tel" autoComplete="tel" required placeholder="06 12 34 56 78" className="sm:col-span-2" />
        <AuthField label="Mot de passe" name="password" type="password" autoComplete="new-password" required minLength={8}
          hint="8 caractères minimum, avec des lettres et des chiffres" />
        <AuthField label="Confirmer" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        <div className="flex flex-col gap-3 sm:col-span-2">
          <Check name="sms_opt_in" defaultChecked>Me prévenir par SMS si un de mes cours est annulé.</Check>
          <Check name="terms" required>
            J&apos;accepte les <Link href="/cgv" className="underline underline-offset-4">conditions générales</Link> et la{" "}
            <Link href="/confidentialite" className="underline underline-offset-4">politique de confidentialité</Link>.
          </Check>
        </div>
        <FormPill className="w-full sm:col-span-2">Créer mon compte →</FormPill>
      </ActionForm>
    </AuthShell>
  );
}
