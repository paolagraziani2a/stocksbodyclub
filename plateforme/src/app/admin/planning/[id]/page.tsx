import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, Input, PageHeader, Table, buttonStyles } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDay, formatTime, mondayOf, parisDay, parisTime } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { cancelSession, deleteSession, setAttendance, updateSession } from "../actions";
import { SessionFields, type TeacherOption } from "../session-fields";

export const metadata: Metadata = { title: "Cours" };

type SmsRow = { id: number; recipient: string; status: string; error: string | null; created_at: string; profiles: { first_name: string; last_name: string } | null };
const SMS_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "danger" | "accent" }> = {
  sent: { label: "Envoyé", tone: "success" },
  simulated: { label: "Simulé", tone: "accent" },
  failed: { label: "Échec", tone: "danger" },
  skipped: { label: "Non envoyé", tone: "neutral" },
};
type Roster = { booking_id: string; first_name: string; last_initial: string; status: string };
const STATUS: Record<string, { label: string; tone: "neutral" | "success" | "danger" }> = {
  booked: { label: "Inscrite", tone: "neutral" },
  attended: { label: "Présente", tone: "success" },
  no_show: { label: "Absente", tone: "danger" },
};

export default async function SessionPage({ params, searchParams }: PageProps<"/admin/planning/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : 0);
  const supabase = await createClient();
  const [{ data: s }, { data: teachers }, { data: roster }, { count: waitlist }, { data: sms }] = await Promise.all([
    supabase.from("class_sessions").select("*, teachers(display_name)").eq("id", id).maybeSingle(),
    supabase.from("teachers").select("id, display_name").eq("active", true).order("display_name").returns<TeacherOption[]>(),
    supabase.rpc("session_roster", { p_session_id: id }),
    supabase.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("session_id", id).eq("status", "waiting"),
    supabase.from("notification_log").select("id, recipient, status, error, created_at, profiles(first_name, last_name)")
      .eq("session_id", id).order("created_at").returns<SmsRow[]>(),
  ]);
  if (!s) notFound();

  const cancelled = s.status === "cancelled";
  const started = new Date(s.starts_at) <= new Date();
  const duration = Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000);
  const back = `/admin/planning?semaine=${mondayOf(parisDay(s.starts_at))}`;

  return (
    <>
      <Link href={back} className="text-sm text-muted hover:text-ink">← Planning</Link>
      <PageHeader
        title={s.title}
        subtitle={<span className="capitalize">{formatDay(s.starts_at)} · {formatTime(s.starts_at)}–{formatTime(s.ends_at)} · {s.teachers?.display_name ?? "professeur à définir"}</span>}
        actions={cancelled ? <Badge tone="danger">Cours annulé</Badge> : <Badge>{s.booked_count}/{s.capacity} inscrites{waitlist ? ` · ${waitlist} en attente` : ""}</Badge>}
      />

      {typeof sp.annule === "string" && (
        <p role="status" className="mb-6 rounded-xl bg-blush px-4 py-3 text-sm">
          Cours annulé. {num(sp.annule)} cliente(s) recréditée(s).
          {num(sp.sms) > 0 && ` ${num(sp.sms)} SMS envoyé(s).`}
          {num(sp.simu) > 0 && ` ${num(sp.simu)} SMS simulé(s) : l'envoi réel s'active avec la clé Brevo.`}
          {num(sp.ko) > 0 && ` ${num(sp.ko)} cliente(s) non prévenue(s) par SMS (voir ci-dessous).`}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <h2 className="text-2xl">Inscrites</h2>
          {(roster as Roster[] | null)?.length ? (
            <Table>
              <thead><tr><th>Cliente</th><th>Statut</th><th className="text-right">Présence</th></tr></thead>
              <tbody>
                {(roster as Roster[]).map((r) => (
                  <tr key={r.booking_id}>
                    <td>{r.first_name} {r.last_initial}.</td>
                    <td><Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                    <td className="text-right">
                      {started && !cancelled ? (
                        <div className="inline-flex gap-1">
                          {(["attended", "no_show"] as const).map((st) => (
                            <ActionForm key={st} action={setAttendance}>
                              <input type="hidden" name="booking" value={r.booking_id} />
                              <input type="hidden" name="status" value={st} />
                              <SubmitButton variant={r.status === st ? "primary" : "secondary"} className="px-3 py-1.5 text-xs">
                                {st === "attended" ? "Présente" : "Absente"}
                              </SubmitButton>
                            </ActionForm>
                          ))}
                        </div>
                      ) : <span className="text-xs text-muted">après le début</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <Empty>Personne n&apos;est encore inscrit.</Empty>}
        </Card>

        {!cancelled && (
          <Card>
            <h2 className="text-2xl">Modifier</h2>
            <ActionForm action={updateSession} className="mt-6">
              <input type="hidden" name="id" value={s.id} />
              <SessionFields
                teachers={teachers ?? []}
                defaults={{ title: s.title, date: parisDay(s.starts_at), start: parisTime(s.starts_at), duration,
                            teacher: s.teacher_id, capacity: s.capacity, notes: s.notes }}
              />
              <SubmitButton className="mt-4">Enregistrer</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>

      {(sms ?? []).length > 0 && (
        <Card className="mt-6">
          <h2 className="text-2xl">SMS d&apos;annulation</h2>
          <Table>
            <thead><tr><th>Cliente</th><th>Numéro</th><th>Statut</th></tr></thead>
            <tbody>
              {(sms ?? []).map((m) => (
                <tr key={m.id}>
                  <td>{m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : "—"}</td>
                  <td className="tabular-nums">{formatPhone(m.recipient) || m.recipient}</td>
                  <td><Badge tone={SMS_STATUS[m.status]?.tone}>{SMS_STATUS[m.status]?.label ?? m.status}</Badge>
                    {m.error && <span className="ml-2 text-xs text-muted">{m.error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {!cancelled && (
        <Card className="mt-6 border-danger/20">
          <h2 className="text-2xl">Annuler ou supprimer</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <ActionForm action={cancelSession} confirm="Annuler ce cours et recréditer toutes les inscrites ?" className="flex flex-col gap-3">
              <input type="hidden" name="id" value={s.id} />
              <p className="text-sm text-muted">Toutes les inscrites sont recréditées automatiquement et prévenues par SMS.</p>
              <Field label="Motif (facultatif)"><Input name="reason" placeholder="Ex. professeure malade" maxLength={200} /></Field>
              <SubmitButton variant="danger">Annuler le cours</SubmitButton>
            </ActionForm>
            <ActionForm action={deleteSession} confirm="Supprimer définitivement ce cours ?" className="flex flex-col gap-3">
              <input type="hidden" name="id" value={s.id} />
              <p className="text-sm text-muted">Possible uniquement si personne n&apos;a jamais réservé (erreur de saisie).</p>
              <SubmitButton variant="ghost" className="self-start text-danger">Supprimer</SubmitButton>
            </ActionForm>
          </div>
        </Card>
      )}
      <p className="mt-6"><Link href={back} className={buttonStyles.ghost}>Retour au planning</Link></p>
    </>
  );
}
