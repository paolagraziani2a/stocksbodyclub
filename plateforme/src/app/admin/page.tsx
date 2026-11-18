import type { Metadata } from "next";
import { Card, Empty, Field, Input, PageHeader, Stat, Table, buttonStyles } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { addDays, firstOfMonth, isValidDay, labelOfDay, lastOfMonth, mondayOf, parisDay } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tableau de bord" };

type Summary = {
  from: string; to: string;
  gross_cents: number; refunds_cents: number; fees_cents: number; discounts_cents: number;
  net_ttc_cents: number; net_ht_cents: number; orders: number;
  products_sold: { name: string; count: number; amount_cents: number }[];
  bookings: number; late_cancellations: number; no_shows: number; active_clients: number;
  sessions: number; capacity: number; fill_rate: number;
  credits_consumed: number; consumed_value_cents: number;
};

type TeacherPay = { teacher_id: string; teacher_name: string; sessions: number; attendees: number; base_cents: number; amount_cents: number };
type TopClient = { user_id: string; full_name: string; email: string; paid_cents: number; classes: number };

const pct = (x: number) => `${Math.round(x * 100)} %`;

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();

  const today = parisDay();
  const week = { from: mondayOf(today), to: addDays(mondayOf(today), 6) };
  const month = { from: firstOfMonth(today), to: lastOfMonth(today) };
  const custom = isValidDay(sp.du) && isValidDay(sp.au) && sp.du <= sp.au ? { from: sp.du, to: sp.au } : null;

  const [dash, payWeek, payMonth, top, customSummary] = await Promise.all([
    supabase.rpc("admin_dashboard"),
    supabase.rpc("admin_teacher_pay", { p_from: week.from, p_to: week.to }),
    supabase.rpc("admin_teacher_pay", { p_from: month.from, p_to: month.to }),
    supabase.rpc("admin_top_clients", { p_from: month.from, p_to: month.to, p_limit: 10 }),
    custom ? supabase.rpc("admin_revenue_summary", { p_from: custom.from, p_to: custom.to }) : Promise.resolve({ data: null }),
  ]);

  const d = dash.data as { today: Summary; week: Summary; month: Summary } | null;
  if (!d) return <Empty>Impossible de charger le tableau de bord.</Empty>;

  const weekPay = new Map(((payWeek.data ?? []) as TeacherPay[]).map((t) => [t.teacher_id, t]));
  const monthPay = (payMonth.data ?? []) as TeacherPay[];
  const teachers = [...monthPay];
  for (const t of weekPay.values()) if (!teachers.some((m) => m.teacher_id === t.teacher_id)) teachers.push(t);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={`${labelOfDay(today)} · montants TTC encaissés, remboursements déduits`}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <RevenueCard label="Aujourd'hui" s={d.today} />
        <RevenueCard label={`Semaine du ${labelOfDay(week.from, { day: "numeric", month: "short" })}`} s={d.week} />
        <RevenueCard label={labelOfDay(month.from, { month: "long", year: "numeric" })} s={d.month} />
      </section>

      <section className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Réservations (mois)" value={d.month.bookings}
          detail={`${d.month.late_cancellations} annulation(s) tardive(s) · ${d.month.no_shows} absence(s)`} />
        <Stat label="Remplissage (mois)" value={pct(d.month.fill_rate)} detail={`${d.month.sessions} cours · ${d.month.capacity} places`} />
        <Stat label="Clientes actives (mois)" value={d.month.active_clients} detail="au moins un cours réservé" />
        <Stat label="Valeur consommée (mois)" value={formatEuros(d.month.consumed_value_cents)}
          detail={`${d.month.credits_consumed} crédit(s) utilisé(s) · ne s'ajoute pas au CA`} />
      </section>

      <div className="mt-10 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="text-2xl">Rémunération des coachs</h2>
          <p className="mt-1 text-xs text-muted">Cours terminés uniquement. Les cartes offertes comptent au prix public.</p>
          {teachers.length === 0 ? <Empty>Aucun cours terminé pour l&apos;instant.</Empty> : (
            <Table compact>
              <thead><tr><th>Coach</th><th className="text-right">Semaine</th><th className="text-right">Mois</th></tr></thead>
              <tbody>
                {teachers.map((t) => {
                  const m = monthPay.find((x) => x.teacher_id === t.teacher_id);
                  const w = weekPay.get(t.teacher_id);
                  return (
                    <tr key={t.teacher_id}>
                      <td>{t.teacher_name}<div className="text-xs text-muted">{m?.sessions ?? 0} cours · {m?.attendees ?? 0} élèves ce mois</div></td>
                      <td className="text-right tabular-nums">{formatEuros(Number(w?.amount_cents ?? 0))}</td>
                      <td className="text-right tabular-nums font-medium">{formatEuros(Number(m?.amount_cents ?? 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <h2 className="text-2xl">Meilleures clientes du mois</h2>
          <p className="mt-1 text-xs text-muted">Classées par montant payé, puis par nombre de cours.</p>
          {(top.data ?? []).length === 0 ? <Empty>Pas encore de données ce mois-ci.</Empty> : (
            <Table compact>
              <thead><tr><th>#</th><th>Cliente</th><th className="text-right">Payé</th><th className="text-right">Cours</th></tr></thead>
              <tbody>
                {((top.data ?? []) as TopClient[]).map((c, i) => (
                  <tr key={c.user_id}>
                    <td className="text-muted">{i + 1}</td>
                    <td>{c.full_name || c.email}<div className="text-xs text-muted">{c.email}</div></td>
                    <td className="text-right tabular-nums">{formatEuros(Number(c.paid_cents))}</td>
                    <td className="text-right tabular-nums">{c.classes}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-2xl">Cartes vendues ce mois</h2>
        {d.month.products_sold.length === 0 ? <Empty>Aucune vente ce mois-ci.</Empty> : (
          <ul className="mt-4 divide-y divide-line text-sm">
            {d.month.products_sold.map((p) => (
              <li key={p.name} className="flex justify-between py-2.5">
                <span>{p.name} <span className="text-muted">× {p.count}</span></span>
                <span className="tabular-nums">{formatEuros(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-2xl">Période personnalisée</h2>
        <form className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Du"><Input type="date" name="du" defaultValue={custom?.from ?? month.from} required /></Field>
          <Field label="Au"><Input type="date" name="au" defaultValue={custom?.to ?? today} required /></Field>
          <button className={buttonStyles.secondary}>Calculer</button>
        </form>
        {customSummary.data && <SummaryDetail s={customSummary.data as Summary} />}
      </Card>
    </>
  );
}

function RevenueCard({ label, s }: { label: string; s: Summary }) {
  return (
    <Stat
      label={label}
      value={formatEuros(s.net_ttc_cents)}
      detail={<>{formatEuros(s.net_ht_cents)} HT · {s.orders} vente(s){s.refunds_cents > 0 && <> · {formatEuros(s.refunds_cents)} remboursé</>}</>}
    />
  );
}

function SummaryDetail({ s }: { s: Summary }) {
  const rows: [string, string][] = [
    ["Encaissé (TTC)", formatEuros(s.gross_cents)],
    ["Remboursements", `− ${formatEuros(s.refunds_cents)}`],
    ["Net TTC", formatEuros(s.net_ttc_cents)],
    ["Net HT", formatEuros(s.net_ht_cents)],
    ["Frais Stripe", formatEuros(s.fees_cents)],
    ["Remises accordées", formatEuros(s.discounts_cents)],
    ["Ventes", String(s.orders)],
    ["Réservations", String(s.bookings)],
    ["Taux de remplissage", pct(s.fill_rate)],
    ["Clientes actives", String(s.active_clients)],
    ["Crédits consommés", String(s.credits_consumed)],
    ["Valeur consommée", formatEuros(s.consumed_value_cents)],
  ];
  return (
    <dl className="mt-6 grid gap-x-8 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-t border-line py-2.5">
          <dt className="text-muted">{k}</dt><dd className="tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
