import type { Metadata } from "next";
import Link from "next/link";
import { Display, Intensity, Label, Pill, Section } from "@/components/site";
import { cn } from "@/components/ui";
import { DISCIPLINE_ORDER, DISCIPLINES, LEVELS } from "@/lib/format";
import { getClassTypes } from "@/lib/site";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "Les cours",
  description: "Lagree, Yoga et Mat Pilates : tous les cours du studio, du débutant à l'intense.",
};

export default async function ClassesPage() {
  const types = await getClassTypes();
  const groups = DISCIPLINE_ORDER.map((d) => ({ d, list: types.filter((t) => t.discipline === d) })).filter((g) => g.list.length);

  return (
    <main>
      <Section className="pb-10 sm:pb-14">
        <Label n="01">Mouvement</Label>
        <Display as="h1" main={`${["Une", "Deux", "Trois"][groups.length - 1] ?? groups.length}`} accent={groups.length > 1 ? "pratiques." : "pratique."} className="mt-6" />
        <p className="mt-8 max-w-xl leading-relaxed text-muted">
          Du Lagree intense au yoga doux, nos cours sont pensés comme une progression. Choisissez selon votre énergie du jour : nos coachs adaptent toujours.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          <span className="flex items-center gap-2"><Intensity value={1} /> Doux</span>
          <span className="flex items-center gap-2"><Intensity value={2} /> Modéré</span>
          <span className="flex items-center gap-2"><Intensity value={3} /> Intense</span>
        </div>
      </Section>

      {groups.map(({ d, list }, gi) => (
        <section key={d} id={d} className={cn("scroll-mt-16 border-t border-ink", gi % 2 === 1 && "bg-sand")}>
          <Section className="grid gap-10 md:grid-cols-[1fr_2fr]">
            <div className="md:sticky md:top-24 md:self-start">
              <Label n={`0${gi + 1}`}>{list.length} cours</Label>
              <h2 className="mt-5 text-7xl">{DISCIPLINES[d].label}</h2>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{DISCIPLINES[d].tagline}</p>
              <Pill href={`/planning?discipline=${d}`} tone="outline" className="mt-8">Voir les créneaux</Pill>
            </div>
            <ul className="border-t border-line">
              {list.map((t) => (
                <li key={t.id} className="border-b border-line py-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <h3 className="text-4xl">{t.name}</h3>
                    <Intensity value={t.intensity} />
                  </div>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    {LEVELS[t.level]} · {t.duration_minutes} min · {t.default_capacity} places
                  </p>
                  {t.description && <p className="mt-4 max-w-xl leading-relaxed text-muted">{t.description}</p>}
                  <Link href={`/planning?discipline=${d}&cours=${t.slug}`} className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.15em] underline-offset-4 hover:underline">
                    Réserver ce cours →
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </section>
      ))}
    </main>
  );
}
