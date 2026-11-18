import type { Metadata } from "next";
import Link from "next/link";
import { CoachPortrait, Kicker, Section } from "@/components/site";
import { buttonStyles, cn } from "@/components/ui";
import { addDays, formatTime, isUpcoming, isValidDay, labelOfDay, parisDay } from "@/lib/dates";
import { getSessions } from "@/lib/site";

export const metadata: Metadata = { title: "Planning", description: "Les prochains cours de Lagree et les places disponibles." };

export default async function PublicPlanningPage({ searchParams }: PageProps<"/planning">) {
  const sp = await searchParams;
  const today = parisDay();
  const start = isValidDay(sp.du) && sp.du >= today ? sp.du : today;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const selected = isValidDay(sp.jour) && days.includes(sp.jour) ? sp.jour : start;

  const sessions = await getSessions(`${addDays(start, -1)}T00:00:00Z`, `${addDays(start, 8)}T00:00:00Z`);
  const ofDay = sessions.filter((s) => parisDay(s.starts_at) === selected && isUpcoming(s.starts_at));
  const countByDay = new Map(days.map((d) => [d, sessions.filter((s) => parisDay(s.starts_at) === d && s.status === "scheduled").length]));

  return (
    <main>
      <Section className="pb-8 sm:pb-10">
        <Kicker>Planning</Kicker>
        <h1 className="mt-4 text-6xl sm:text-7xl">Les cours</h1>
      </Section>

      <Section className="pt-0 sm:pt-0">
        {/* Sélecteur de jour : défilement horizontal sur mobile */}
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
          {days.map((d) => (
            <Link key={d} href={`/planning?du=${start}&jour=${d}`} scroll={false}
              className={cn(
                "flex min-w-[68px] flex-col items-center rounded-2xl border px-3 py-3 transition",
                d === selected ? "border-ink bg-ink text-ivory" : "border-line bg-white/60 hover:border-taupe",
              )}>
              <span className="text-xs uppercase tracking-[0.15em] opacity-70">{labelOfDay(d, { weekday: "short" }).replace(".", "")}</span>
              <span className="mt-1 font-serif text-2xl">{labelOfDay(d, { day: "numeric" })}</span>
              <span className={cn("mt-1 h-1 w-1 rounded-full", countByDay.get(d) ? (d === selected ? "bg-ivory" : "bg-taupe") : "bg-transparent")} />
            </Link>
          ))}
          <Link href={`/planning?du=${addDays(start, 7)}`} aria-label="Semaine suivante"
            className="flex min-w-[52px] items-center justify-center rounded-2xl border border-line text-muted hover:border-taupe">→</Link>
        </div>

        <h2 className="mt-10 font-serif text-3xl capitalize">{labelOfDay(selected)}</h2>
        {ofDay.length === 0 ? (
          <p className="mt-6 text-muted">Aucun cours ce jour-là.</p>
        ) : (
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {ofDay.map((s) => {
              const left = s.capacity - s.booked_count;
              const cancelled = s.status === "cancelled";
              return (
                <li key={s.id} className={cn("flex items-center gap-4 py-5", cancelled && "opacity-50")}>
                  <div className="w-16 shrink-0">
                    <p className="font-serif text-2xl tabular-nums">{formatTime(s.starts_at)}</p>
                    <p className="text-xs text-muted">{Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000)} min</p>
                  </div>
                  {s.teachers && (
                    <Link href={`/coachs/${s.teachers.slug}`} className="hidden shrink-0 sm:block" aria-label={s.teachers.display_name}>
                      <CoachPortrait coach={s.teachers} small className="h-12 w-12 rounded-full" />
                    </Link>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate", cancelled && "line-through")}>{s.title}</p>
                    {s.teachers && (
                      <Link href={`/coachs/${s.teachers.slug}`} className="text-sm text-muted hover:text-ink">avec {s.teachers.display_name}</Link>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-5">
                    <span className={cn("text-xs", left <= 2 && left > 0 ? "text-taupe-deep" : "text-muted")}>
                      {cancelled ? "Annulé" : left > 0 ? `${left} place${left > 1 ? "s" : ""}` : "Complet"}
                    </span>
                    {!cancelled && (
                      <Link href={`/connexion?suite=/planning`} className={cn(left > 0 ? buttonStyles.primary : buttonStyles.secondary, "px-4 py-2 text-xs")}>
                        {left > 0 ? "Réserver" : "Liste d'attente"}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </main>
  );
}
