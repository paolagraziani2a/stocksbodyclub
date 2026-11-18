import type { Metadata } from "next";
import { CoachCard, Display, Label, Section } from "@/components/site";
import { getCoaches } from "@/lib/site";

// Régénérée au plus toutes les 60 s (et immédiatement après une modification depuis l'admin)
export const revalidate = 60;

export const metadata: Metadata = { title: "Les coachs", description: "Rencontrez l'équipe de coachs Lagree du studio." };

export default async function CoachesPage() {
  const coaches = await getCoaches();
  return (
    <main>
      <Section className="pb-10 sm:pb-14">
        <Label n="02">L&apos;équipe</Label>
        <Display as="h1" main="Les coachs" accent="qui vous suivent." className="mt-6" />
        <p className="mt-8 max-w-xl leading-relaxed text-muted">
          Des coachs certifiés, attentifs à chaque mouvement, pour vous accompagner à votre rythme.
        </p>
      </Section>
      <Section className="pt-0 sm:pt-0">
        {coaches.length === 0
          ? <p className="text-muted">L&apos;équipe sera présentée très bientôt.</p>
          : <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">{coaches.map((c, i) => <CoachCard key={c.id} coach={c} index={i} />)}</div>}
      </Section>
    </main>
  );
}
