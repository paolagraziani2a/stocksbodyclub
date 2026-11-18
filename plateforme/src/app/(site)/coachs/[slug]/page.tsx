import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoachCard, CoachPortrait, DisciplineTag, Label, Pill, Section } from "@/components/site";
import { formatShortDay, formatTime } from "@/lib/dates";
import { getCoach, getCoaches, getSessions } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/coachs/[slug]">): Promise<Metadata> {
  const coach = await getCoach((await params).slug);
  return coach
    ? { title: coach.display_name, description: coach.headline || `Les cours de ${coach.display_name} au studio.` }
    : { title: "Coach" };
}

export default async function CoachPage({ params }: PageProps<"/coachs/[slug]">) {
  const { slug } = await params;
  const coach = await getCoach(slug);
  if (!coach) notFound();

  const now = new Date();
  const [sessions, all] = await Promise.all([
    getSessions(now.toISOString(), new Date(now.getTime() + 14 * 864e5).toISOString(), coach.id),
    getCoaches(),
  ]);
  const upcoming = sessions.filter((s) => s.status === "scheduled").slice(0, 6);
  const others = all.filter((c) => c.id !== coach.id).slice(0, 3);

  return (
    <main>
      <Section className="grid gap-12 pt-10 md:grid-cols-[5fr_6fr] md:gap-20 sm:pt-16">
        <div className="md:sticky md:top-24 md:self-start">
          <div className="overflow-hidden rounded-3xl">
            <CoachPortrait coach={coach} className="aspect-[4/5] w-full" />
          </div>
        </div>

        <div className="md:pt-10">
          <Link href="/coachs" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-ink">← Les coachs</Link>
          <Label className="mt-10">{coach.headline || "Coach Lagree"}</Label>
          <h1 className="mt-5 text-8xl sm:text-9xl">{coach.display_name}</h1>
          <p className="mt-5 flex flex-wrap gap-2">{coach.disciplines.map((d) => <DisciplineTag key={d} d={d} />)}</p>

          {coach.quote && (
            <blockquote className="accent mt-10 border-l border-taupe pl-6 text-3xl leading-snug text-taupe">
              « {coach.quote} »
            </blockquote>
          )}

          {coach.bio && <p className="mt-10 whitespace-pre-line leading-relaxed text-muted">{coach.bio}</p>}

          {(coach.specialties.length > 0 || coach.certifications) && (
            <dl className="mt-12 grid gap-8 border-t border-line pt-8 sm:grid-cols-2">
              {coach.specialties.length > 0 && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Spécialités</dt>
                  <dd className="mt-3 flex flex-wrap gap-2">
                    {coach.specialties.map((s) => <span key={s} className="rounded-full border border-line px-3 py-1 text-sm">{s}</span>)}
                  </dd>
                </div>
              )}
              {coach.certifications && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Formation</dt>
                  <dd className="mt-3 whitespace-pre-line text-sm leading-relaxed">{coach.certifications}</dd>
                </div>
              )}
            </dl>
          )}

          {coach.instagram_url && (
            <a href={coach.instagram_url} target="_blank" rel="noopener" className="mt-8 inline-block text-sm text-muted underline decoration-line underline-offset-8 hover:text-ink">
              Suivre {coach.display_name} sur Instagram ↗
            </a>
          )}

          <div className="mt-14">
            <h2 className="text-5xl">Ses prochains <span className="accent text-taupe">cours.</span></h2>
            {upcoming.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Aucun cours programmé ces deux prochaines semaines.</p>
            ) : (
              <ul className="mt-6 divide-y divide-line border-y border-ink">
                {upcoming.map((s) => {
                  const left = s.capacity - s.booked_count;
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-4 py-4">
                      <div>
                        <p className="capitalize">{formatShortDay(s.starts_at)} · {formatTime(s.starts_at)}</p>
                        <p className="text-sm text-muted">{s.title}</p>
                      </div>
                      <span className="text-sm text-muted">{left > 0 ? `${left} place${left > 1 ? "s" : ""}` : "Complet"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <Pill href="/planning" className="mt-8">Réserver un cours</Pill>
          </div>
        </div>
      </Section>

      {others.length > 0 && (
        <section className="bg-sand/60">
          <Section>
            <h2 className="text-6xl">Les autres <span className="accent text-taupe">coachs.</span></h2>
            <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">{others.map((c) => <CoachCard key={c.id} coach={c} />)}</div>
          </Section>
        </section>
      )}
    </main>
  );
}
