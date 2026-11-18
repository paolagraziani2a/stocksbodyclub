import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  const { suite } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-center text-xs uppercase tracking-[0.35em] text-muted">The Body Club</p>
        <h1 className="mt-4 text-center text-4xl">Connexion</h1>
        <ActionForm action={signIn} className="mt-10 flex flex-col gap-4">
          <input type="hidden" name="suite" value={typeof suite === "string" ? suite : ""} />
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Mot de passe">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton className="mt-4 w-full py-3">Se connecter</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
