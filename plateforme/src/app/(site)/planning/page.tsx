import type { Metadata } from "next";
import Link from "next/link";
import { CoachPortrait, Display, Label, Section } from "@/components/site";
import { cn } from "@/components/ui";
import { addDays, formatTime, hoursUntil, isUpcoming, isValidDay, labelOfDay, parisDay } from "@/lib/dates";
import { getSessions } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { SessionAction } from "./session-action";

export const metadata: Metadata = { title: "Planning", description: "Les prochains cours de Lagree et les places disponibles." };

export default async function PlanningPage({ searchParams }: PageProps<"/planning">) {
  const sp = await searchParams;
  const today = parisDay();
  const start = isValidDay(sp.du) && sp.du >= today ? sp.du : today;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const selected = isValidDay(sp.jour) && days.includes(sp.jour) ? sp.jour : start;

  const supabase = await createClient();
  const [sessions, { data: { user } }, { data: settings }] = await Promise.all([
    getSessions(`${addDays(start, -1)}T00:00:00Z`, `${addDays(start, 8)}T00:00:00Z`),
    supabase.auth.getUser(),
    supabase.from("studio_settings").select("cancel_window_hours").single(),
  ]);
  const ofDay = sessions.filter((s) => parisDay(s.starts_at) === selected && isUpcoming(s.starts_at));
  const countByDay = new Map(days.map((d) => [d, sessions.filter((s) => parisDay(s.starts_at) === d && s.status === "scheduled" && isUpcoming(s.starts_at)).length]));

  // Réservations et liste d'attente de la cliente connectée, pour ces cours
  const ids = ofDay.map((s) => s.id);
  const [{ data: mine }, { data: waiting }] = user && ids.length
    ? await Promise.all([
        supabase.from("bookings").select("id, session_id").eq("user_id", user.id).eq("status", "booked").in("session_id", ids),
        supabase.from("waitlist_entries").select("session_id").eq("user_id", user.id).eq("status", "waiting").in("session_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const bookingOf = new Map((mine ?? []).map((b) => [b.session_id as string, b.id as string]));
  const waitingSet = new Set((waiting ?? []).map((w) => w.session_id as string));
  const windowH = settings?.cancel_window_hours ?? 12;

  return (
    <main>
      <Section className="pb-8 sm:pb-10">
        <Label n="01">Réservation · en direct</Label>
        <Display as="h1" main="Réserver" accent="un cours." className="mt-6" />
      </Section>

      <Section className="pt-0 sm:pt-0">
        {/* Sélecteur de jour : défilement horizontal sur mobile */}
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
          {days.map((d) => (
            <Link key={d} href={`/planning?du=${start}&jour=${d}`} scroll={false}
              className={cn(
                "flex min-w-[66px] flex-col items-center rounded-full border px-3 py-3 transition",
                d === selected ? "border-ink bg-ink text-ivory" : "border-ink/20 hover:border-ink",
              )}>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] opacity-70">{labelOfDay(d, { weekday: "short" }).replace(".", "")}</span>
              <span className="mt-1 font-serif text-3xl font-bold leading-none">{labelOfDay(d, { day: "numeric" })}</span>
              <span className={cn("mt-1.5 h-1 w-1 rounded-full", countByDay.get(d) ? (d === selected ? "bg-sage" : "bg-taupe") : "bg-transparent")} />
            </Link>
          ))}
          <Link href={`/planning?du=${addDays(start, 7)}`} aria-label="Semaine suivante"
            className="flex min-w-[56px] items-center justify-center rounded-full border border-ink/20 hover:border-ink">→</Link>
        </div>

        <h2 className="mt-12 text-5xl capitalize">{labelOfDay(selected, { weekday: "long" })} <span className="accent text-taupe">{labelOfDay(selected, { day: "numeric", month: "long" })}</span></h2>
        {ofDay.length === 0 ? (
          <p className="mt-6 text-muted">Aucun cours ce jour-là.</p>
        ) : (
          <ul className="mt-8 border-t border-ink">
            {ofDay.map((s) => {
              const left = s.capacity - s.booked_count;
              const cancelled = s.status === "cancelled";
              const bookingId = bookingOf.get(s.id);
              const state = !user ? "guest" : bookingId ? "booked" : waitingSet.has(s.id) ? "waiting" : left > 0 ? "open" : "full";
              const late = hoursUntil(s.starts_at) < windowH;
              return (
                <li key={s.id} className={cn("flex items-center gap-4 border-b border-line py-5", cancelled && "opacity-50")}>
                  <div className="w-20 shrink-0">
                    <p className="font-serif text-4xl font-bold leading-none tabular-nums">{formatTime(s.starts_at)}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
                      {Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000)} min
                    </p>
                  </div>
                  {s.teachers && (
                    <Link href={`/coachs/${s.teachers.slug}`} className="hidden shrink-0 sm:block" aria-label={s.teachers.display_name}>
                      <CoachPortrait coach={s.teachers} small className="h-12 w-12 rounded-full" />
                    </Link>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-serif text-2xl font-bold uppercase leading-none", cancelled && "line-through")}>{s.title}</p>
                    {s.teachers && <Link href={`/coachs/${s.teachers.slug}`} className="text-sm text-muted hover:text-ink">avec {s.teachers.display_name}</Link>}
                    <p className={cn("mt-1 font-mono text-[10px] uppercase tracking-[0.15em] sm:hidden", left <= 2 && left > 0 ? "text-taupe" : "text-muted")}>
                      {cancelled ? "Annulé" : left > 0 ? `${left} place${left > 1 ? "s" : ""}` : "Complet"}
                    </p>
                  </div>
                  <span className={cn("hidden w-20 text-right font-mono text-[10px] uppercase tracking-[0.15em] sm:block", left <= 2 && left > 0 ? "text-taupe" : "text-muted")}>
                    {cancelled ? "Annulé" : left > 0 ? `${left} place${left > 1 ? "s" : ""}` : "Complet"}
                  </span>
                  {!cancelled && <SessionAction state={state} sessionId={s.id} bookingId={bookingId} late={late} />}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Annulation gratuite jusqu&apos;à {windowH} h avant le cours · <Link href="/tarifs" className="underline underline-offset-4">Tarifs</Link>
        </p>
      </Section>
    </main>
  );
}
