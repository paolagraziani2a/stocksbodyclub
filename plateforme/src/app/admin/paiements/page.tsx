import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Stat, Table, buttonStyles, cn } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatTime, parisDay } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import { stripeLinks } from "@/lib/stripe-links";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Paiements & factures" };

type Order = {
  id: string; status: string; product_name: string; amount_subtotal_cents: number; amount_total_cents: number | null;
  amount_discount_cents: number; amount_refunded_cents: number; stripe_fee_cents: number | null; promotion_code: string | null;
  paid_at: string | null; created_at: string; stripe_payment_intent_id: string | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
  invoices: { id: string; number: string; kind: string }[];
};
type Invoice = {
  id: string; number: string; kind: string; issued_at: string; total_ttc_cents: number; total_ht_cents: number;
  total_vat_cents: number; buyer: { name: string; email: string };
};

const STATUS: Record<string, { label: string; tone: "neutral" | "success" | "danger" | "accent" }> = {
  paid: { label: "Payé", tone: "success" },
  pending: { label: "En attente", tone: "neutral" },
  partially_refunded: { label: "Remb. partiel", tone: "accent" },
  refunded: { label: "Remboursé", tone: "danger" },
  failed: { label: "Échoué", tone: "danger" },
  expired: { label: "Abandonné", tone: "neutral" },
};

/** Bornes UTC larges d'un mois (filtrées ensuite au jour près en heure de Paris). */
function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1, -3));
  const to = new Date(Date.UTC(y, m, 1, 3));
  return { from: from.toISOString(), to: to.toISOString() };
}
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/paiements">) {
  await requireAdmin();
  const sp = await searchParams;
  const month = typeof sp.mois === "string" && /^\d{4}-\d{2}$/.test(sp.mois) ? sp.mois : parisDay().slice(0, 7);
  const view = sp.vue === "factures" ? "factures" : "paiements";
  const { from, to } = monthRange(month);
  const inMonth = (iso: string | null) => !!iso && parisDay(iso).startsWith(month);
  const links = stripeLinks();
  const supabase = await createClient();

  const [{ data: orders }, { data: invoices }] = await Promise.all([
    supabase.from("orders")
      .select("id, status, product_name, amount_subtotal_cents, amount_total_cents, amount_discount_cents, amount_refunded_cents, stripe_fee_cents, promotion_code, paid_at, created_at, stripe_payment_intent_id, profiles(first_name, last_name, email), invoices(id, number, kind)")
      .gte("created_at", from).lt("created_at", to).order("created_at", { ascending: false }).returns<Order[]>(),
    supabase.from("invoices")
      .select("id, number, kind, issued_at, total_ttc_cents, total_ht_cents, total_vat_cents, buyer")
      .gte("issued_at", from).lt("issued_at", to).order("issued_at", { ascending: false }).returns<Invoice[]>(),
  ]);

  const monthOrders = (orders ?? []).filter((o) => inMonth(o.created_at));
  const monthInvoices = (invoices ?? []).filter((i) => inMonth(i.issued_at));
  const paid = monthOrders.filter((o) => o.paid_at);
  const gross = paid.reduce((s, o) => s + (o.amount_total_cents ?? 0), 0);
  const refunded = paid.reduce((s, o) => s + o.amount_refunded_cents, 0);
  const fees = paid.reduce((s, o) => s + (o.stripe_fee_cents ?? 0), 0);
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`));

  return (
    <>
      <PageHeader
        title="Paiements & factures"
        subtitle={<span className="capitalize">{monthLabel}</span>}
        actions={
          <>
            <Link className={buttonStyles.secondary} href={`?vue=${view}&mois=${shiftMonth(month, -1)}`} aria-label="Mois précédent">←</Link>
            <Link className={buttonStyles.secondary} href={`?vue=${view}&mois=${shiftMonth(month, 1)}`} aria-label="Mois suivant">→</Link>
            <a className={buttonStyles.primary} href={links.payments} target="_blank" rel="noopener">Ouvrir Stripe ↗</a>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Encaissé TTC" value={formatEuros(gross)} detail={`${paid.length} paiement(s)`} />
        <Stat label="Remboursé" value={formatEuros(refunded)} />
        <Stat label="Frais Stripe" value={formatEuros(fees)} detail="renseignés après chaque paiement" />
        <Stat label="Net" value={formatEuros(gross - refunded - fees)} detail="versé sur votre compte" />
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-line bg-white/60 p-1 text-sm">
          {(["paiements", "factures"] as const).map((v) => (
            <Link key={v} href={`?vue=${v}&mois=${month}`}
              className={cn("rounded-full px-4 py-1.5 capitalize", view === v ? "bg-ink text-ivory" : "text-muted")}>
              {v}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a className={buttonStyles.ghost} href={links.coupons} target="_blank" rel="noopener">Codes promo ↗</a>
          <a className={buttonStyles.ghost} href={links.payouts} target="_blank" rel="noopener">Virements ↗</a>
          <a className={buttonStyles.secondary} href={`/admin/paiements/export?mois=${month}`}>Export comptable (CSV)</a>
        </div>
      </div>

      <Card className="mt-4">
        {view === "paiements" ? (
          monthOrders.length === 0 ? <Empty>Aucun paiement ce mois-ci.</Empty> : (
            <Table>
              <thead>
                <tr><th>Date</th><th>Cliente</th><th>Achat</th><th className="text-right">Montant</th><th>Statut</th><th>Facture</th><th></th></tr>
              </thead>
              <tbody>
                {monthOrders.map((o) => {
                  const st = STATUS[o.status] ?? { label: o.status, tone: "neutral" as const };
                  const inv = o.invoices.find((i) => i.kind === "invoice");
                  return (
                    <tr key={o.id}>
                      <td className="whitespace-nowrap tabular-nums">{formatDate(o.created_at)}<div className="text-xs text-muted">{formatTime(o.created_at)}</div></td>
                      <td>{o.profiles ? `${o.profiles.first_name} ${o.profiles.last_name}`.trim() || o.profiles.email : "—"}
                        <div className="text-xs text-muted">{o.profiles?.email}</div></td>
                      <td>{o.product_name}{o.promotion_code && <div className="text-xs text-muted">Code {o.promotion_code}</div>}</td>
                      <td className="text-right tabular-nums">
                        {formatEuros(o.amount_total_cents ?? o.amount_subtotal_cents)}
                        {o.amount_discount_cents > 0 && <div className="text-xs text-muted">− {formatEuros(o.amount_discount_cents)}</div>}
                        {o.amount_refunded_cents > 0 && <div className="text-xs text-danger">remb. {formatEuros(o.amount_refunded_cents)}</div>}
                      </td>
                      <td><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td>{inv ? <Link className="underline decoration-line underline-offset-4 hover:decoration-taupe" href={`/factures/${inv.id}`}>{inv.number}</Link> : <span className="text-muted">—</span>}</td>
                      <td className="text-right">
                        {o.stripe_payment_intent_id && (
                          <a className="text-xs text-taupe-deep hover:underline" href={links.payment(o.stripe_payment_intent_id)} target="_blank" rel="noopener">Stripe ↗</a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )
        ) : monthInvoices.length === 0 ? <Empty>Aucune facture ce mois-ci.</Empty> : (
          <Table>
            <thead>
              <tr><th>Numéro</th><th>Date</th><th>Cliente</th><th className="text-right">HT</th><th className="text-right">TVA</th><th className="text-right">TTC</th></tr>
            </thead>
            <tbody>
              {monthInvoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link className="underline decoration-line underline-offset-4 hover:decoration-taupe" href={`/factures/${i.id}`}>{i.number}</Link>
                    {i.kind === "credit_note" && <span className="ml-2"><Badge tone="danger">Avoir</Badge></span>}
                  </td>
                  <td className="tabular-nums">{formatDate(i.issued_at)}</td>
                  <td>{i.buyer.name || i.buyer.email}</td>
                  <td className="text-right tabular-nums">{formatEuros(i.total_ht_cents)}</td>
                  <td className="text-right tabular-nums">{formatEuros(i.total_vat_cents)}</td>
                  <td className="text-right tabular-nums">{formatEuros(i.total_ttc_cents)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted">
        Les factures sont émises automatiquement à chaque paiement confirmé, et un avoir à chaque remboursement.
        Numérotation continue, sans trou, non modifiable.
      </p>
    </>
  );
}
