import type { Metadata } from "next";
import { CoachCard, Kicker, Section } from "@/components/site";
import { getCoaches } from "@/lib/site";

// Régénérée au plus toutes les 60 s (et immédiatement après une modification depuis l'admin)
export const revalidate = 60;

export const metadata: Metadata = { title: "Les coachs", description: "Rencontrez l'équipe de coachs Lagree du studio." };

export default async function CoachesPage() {
  const coaches = await getCoaches();
  return (
    <main>
      <Section className="pb-10 sm:pb-14">
        <Kicker>L&apos;équipe</Kicker>
        <h1 className="mt-4 text-6xl sm:text-7xl">Les coachs</h1>
        <p className="mt-6 max-w-xl text-lg font-light leading-relaxed text-muted">
          Des coachs certifiés, attentifs à chaque mouvement, pour vous accompagner à votre rythme.
        </p>
      </Section>
      <Section className="pt-0 sm:pt-0">
        {coaches.length === 0
          ? <p className="text-muted">L&apos;équipe sera présentée très bientôt.</p>
          : <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">{coaches.map((c) => <CoachCard key={c.id} coach={c} />)}</div>}
      </Section>
    </main>
  );
}
