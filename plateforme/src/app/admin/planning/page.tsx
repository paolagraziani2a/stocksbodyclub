import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, buttonStyles, cn } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { addDays, formatTime, isValidDay, labelOfDay, mondayOf, parisDay } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { copyWeek, createSessions } from "./actions";
import { SessionFields, type TeacherOption, type TypeOption } from "./session-fields";

export const metadata: Metadata = { title: "Planning" };

type Row = {
  id: string; title: string; starts_at: string; ends_at: string; capacity: number; booked_count: number;
  status: "scheduled" | "cancelled"; teacher_id: string | null; teachers: { display_name: string } | null; class_types: { color: string } | null;
};

export default async function PlanningPage({ searchParams }: PageProps<"/admin/planning">) {
  await requireAdmin();
  const sp = await searchParams;
  const today = parisDay();
  const monday = mondayOf(isValidDay(sp.semaine) ? sp.semaine : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const newDay = isValidDay(sp.jour) ? sp.jour : days.includes(today) ? today : monday;

  const supabase = await createClient();
  const [{ data: sessions }, { data: teachers }, { data: types }] = await Promise.all([
    supabase
      .from("class_sessions")
      .select("id, title, starts_at, ends_at, capacity, booked_count, status, teacher_id, teachers(display_name), class_types(color)")
      .gte("starts_at", `${addDays(monday, -1)}T00:00:00Z`)
      .lt("starts_at", `${addDays(monday, 8)}T00:00:00Z`)
      .order("starts_at")
      .returns<Row[]>(),
    supabase.from("teachers").select("id, display_name, disciplines").eq("active", true).order("display_name").returns<TeacherOption[]>(),
    supabase.from("class_types").select("id, name, discipline, duration_minutes, default_capacity").eq("active", true).order("sort_order").returns<TypeOption[]>(),
  ]);

  const byDay = new Map(days.map((d) => [d, [] as Row[]]));
  for (const s of sessions ?? []) byDay.get(parisDay(s.starts_at))?.push(s);
  const weekCount = [...byDay.values()].flat().filter((s) => s.status === "scheduled").length;

  return (
    <>
      <PageHeader
        title="Planning"
        subtitle={`Semaine du ${labelOfDay(monday, { day: "numeric", month: "long" })} au ${labelOfDay(addDays(monday, 6), { day: "numeric", month: "long", year: "numeric" })} · ${weekCount} cours`}
        actions={
          <>
            <Link className={buttonStyles.secondary} href={`/admin/planning?semaine=${addDays(monday, -7)}`} aria-label="Semaine précédente">←</Link>
            <Link className={buttonStyles.secondary} href="/admin/planning">Cette semaine</Link>
            <Link className={buttonStyles.secondary} href={`/admin/planning?semaine=${addDays(monday, 7)}`} aria-label="Semaine suivante">→</Link>
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-7">
        {days.map((d) => (
          <section key={d} className={cn("rounded-2xl border border-line bg-white/50 p-3", d === today && "border-taupe")}>
            <header className="mb-3 flex items-center justify-between gap-1 px-1">
              <h2 className="font-serif text-lg capitalize">
                <span className="lg:hidden">{labelOfDay(d, { weekday: "long", day: "numeric", month: "long" })}</span>
                <span className="hidden lg:inline">{labelOfDay(d, { weekday: "short", day: "numeric" })}</span>
              </h2>
              <Link href={`/admin/planning?semaine=${monday}&jour=${d}#nouveau`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sand hover:text-ink"
                aria-label={`Ajouter un cours le ${labelOfDay(d)}`} title="Ajouter un cours">+</Link>
            </header>
            <ul className="flex flex-col gap-2">
              {byDay.get(d)!.map((s) => {
                const full = s.booked_count >= s.capacity;
                return (
                  <li key={s.id}>
                    <Link
                      href={`/admin/planning/${s.id}`}
                      style={s.class_types ? { borderLeftColor: s.class_types.color } : undefined}
                      className={cn(
                        "block rounded-xl border border-l-4 border-line bg-white px-3 py-2.5 text-sm transition hover:border-taupe",
                        s.status === "cancelled" && "opacity-50 line-through",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium tabular-nums">{formatTime(s.starts_at)}</span>
                        {s.status === "cancelled" ? <Badge tone="danger">Annulé</Badge>
                          : full ? <Badge tone="accent">Complet</Badge>
                          : <span className="text-xs tabular-nums text-muted">{s.booked_count}/{s.capacity}</span>}
                      </div>
                      <div className="mt-0.5 truncate">{s.title}</div>
                      <div className={cn("truncate text-xs", s.teachers ? "text-muted" : "text-danger")}>
                        {s.teachers?.display_name ?? "Professeur à définir"}
                      </div>
                    </Link>
                  </li>
                );
              })}
              {byDay.get(d)!.length === 0 && <li className="px-1 py-2 text-xs text-muted">—</li>}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-10 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card id="nouveau">
          <h2 className="text-2xl">Nouveau cours</h2>
          <ActionForm action={createSessions} className="mt-6">
            <SessionFields key={newDay} teachers={teachers ?? []} types={types ?? []} defaults={{ date: newDay }} />
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <Field label="Répéter" hint="Même jour, même heure, chaque semaine">
                <select name="repeat" defaultValue="1" className="rounded-xl border border-line bg-white px-3.5 py-2.5">
                  <option value="1">Une seule fois</option>
                  {[2, 4, 8, 12, 26, 52].map((n) => <option key={n} value={n}>{n} semaines</option>)}
                </select>
              </Field>
              <SubmitButton>Créer le cours</SubmitButton>
            </div>
          </ActionForm>
          {(teachers ?? []).length === 0 && (
            <p className="mt-4 text-sm text-muted">
              Aucun professeur pour l&apos;instant : <Link href="/admin/professeurs" className="underline">ajoutez-en un</Link>.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="text-2xl">Dupliquer la semaine</h2>
          <p className="mt-2 text-sm text-muted">
            Recopie tous les cours de cette semaine (mêmes horaires, mêmes professeurs) sur les semaines suivantes.
            Les cours déjà présents ne sont pas dupliqués.
          </p>
          <ActionForm action={copyWeek} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="source" value={monday} />
            <Field label="Sur combien de semaines ?">
              <Input type="number" name="weeks" defaultValue={4} min={1} max={12} />
            </Field>
            <SubmitButton variant="secondary">Dupliquer</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
