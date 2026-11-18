import type { Metadata } from "next";
import Link from "next/link";
import { CoachCard, Display, Label, Section } from "@/components/site";
import { cn } from "@/components/ui";
import { DISCIPLINE_ORDER, DISCIPLINES } from "@/lib/format";
import { getCoaches } from "@/lib/site";

// Régénérée au plus toutes les 60 s (et immédiatement après une modification depuis l'admin)
export const revalidate = 60;

export const metadata: Metadata = { title: "Les coachs", description: "Coachs Lagree, professeurs de yoga et de Pilates du studio." };

export default async function CoachesPage() {
  const coaches = await getCoaches();
  const groups = DISCIPLINE_ORDER
    .map((d) => ({ d, list: coaches.filter((c) => c.disciplines.includes(d)) }))
    .filter((g) => g.list.length > 0);

  return (
    <main>
      <Section className="pb-10 sm:pb-14">
        <Label n="02">L&apos;équipe</Label>
        <Display as="h1" main="Les coachs" accent="qui vous suivent." className="mt-6" />
        <p className="mt-8 max-w-xl leading-relaxed text-muted">
          Coachs Lagree, professeurs de yoga et de Pilates : une équipe attentive à chaque mouvement, pour vous accompagner à votre rythme.
        </p>
        {groups.length > 1 && (
          <nav className="mt-10 flex flex-wrap gap-2">
            {groups.map(({ d }) => (
              <Link key={d} href={`#${d}`} className="rounded-full border border-ink/20 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.15em] hover:border-ink">
                {DISCIPLINES[d].label}
              </Link>
            ))}
          </nav>
        )}
      </Section>

      {groups.length === 0 && <Section className="pt-0"><p className="text-muted">L&apos;équipe sera présentée très bientôt.</p></Section>}

      {groups.map(({ d, list }, gi) => {
        const dark = d === "yoga";
        return (
          <section key={d} id={d} className={cn("scroll-mt-16", dark ? "bg-feature text-ivory" : gi > 0 && "border-t border-line bg-sand")}>
            <Section>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <Label n={`0${gi + 1}`} light={dark}>{DISCIPLINES[d].label}</Label>
                  <Display main={DISCIPLINES[d].teachers} accent={DISCIPLINES[d].teachersAccent} className="mt-6"
                    accentClassName={dark ? "text-sage" : undefined} />
                </div>
                <p className={cn("max-w-xs text-sm leading-relaxed", dark ? "text-ivory/70" : "text-muted")}>{DISCIPLINES[d].tagline}</p>
              </div>
              <div className="mt-14 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c, i) => <CoachCard key={c.id} coach={c} index={i} dark={dark} />)}
              </div>
            </Section>
          </section>
        );
      })}
    </main>
  );
}
