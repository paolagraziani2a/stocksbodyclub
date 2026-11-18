import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { formatDate } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Facture", robots: { index: false } };

type Line = { label: string; quantity: number; unit_ttc_cents: number };

/** Facture imprimable / enregistrable en PDF. Visible par la cliente concernée et l'admin (RLS). */
export default async function InvoicePage({ params }: PageProps<"/factures/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?suite=/factures/${id}`);

  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!inv) notFound();
  const { data: related } = inv.related_invoice_id
    ? await supabase.from("invoices").select("number").eq("id", inv.related_invoice_id).maybeSingle()
    : { data: null };

  const seller = inv.seller as Record<string, string>;
  const buyer = inv.buyer as { name: string; email: string };
  const isCredit = inv.kind === "credit_note";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 print:max-w-none print:p-0">
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>
      <article className="rounded-2xl border border-line bg-white p-8 sm:p-12 print:border-0 print:p-0">
        <header className="flex flex-col justify-between gap-8 sm:flex-row">
          <div>
            <p className="font-serif text-3xl">{seller.trade_name || seller.name}</p>
            <div className="mt-3 whitespace-pre-line text-sm text-muted">
              {seller.name}{seller.legal_form && ` — ${seller.legal_form}`}
              {seller.address && `\n${seller.address}`}
              {seller.siret && `\nSIRET ${seller.siret}`}
              {seller.vat_number && `\nTVA intracommunautaire ${seller.vat_number}`}
            </div>
          </div>
          <div className="sm:text-right">
            <h1 className="text-3xl">{isCredit ? "Avoir" : "Facture"}</h1>
            <p className="mt-2 text-sm">N° <strong className="font-medium">{inv.number}</strong></p>
            <p className="text-sm text-muted">Date : {formatDate(inv.issued_at)}</p>
            {related && <p className="text-sm text-muted">Sur facture {related.number}</p>}
          </div>
        </header>

        <section className="mt-10 text-sm">
          <p className="text-xs uppercase tracking-[0.15em] text-muted">Facturé à</p>
          <p className="mt-1">{buyer.name}</p>
          <p className="text-muted">{buyer.email}</p>
        </section>

        <table className="mt-10 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-[0.12em] text-muted">
              <th className="pb-2 font-normal">Désignation</th>
              <th className="pb-2 text-right font-normal">Qté</th>
              <th className="pb-2 text-right font-normal">Montant TTC</th>
            </tr>
          </thead>
          <tbody>
            {(inv.lines as Line[]).map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-3">{l.label}</td>
                <td className="py-3 text-right tabular-nums">{l.quantity}</td>
                <td className="py-3 text-right tabular-nums">{formatEuros(l.unit_ttc_cents * l.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-6 w-full max-w-xs text-sm">
          <div className="flex justify-between py-1.5"><dt className="text-muted">Total HT</dt><dd className="tabular-nums">{formatEuros(inv.total_ht_cents)}</dd></div>
          <div className="flex justify-between py-1.5"><dt className="text-muted">TVA {Number(inv.vat_rate)} %</dt><dd className="tabular-nums">{formatEuros(inv.total_vat_cents)}</dd></div>
          <div className="flex justify-between border-t border-ink py-2 text-base font-medium"><dt>Total TTC</dt><dd className="tabular-nums">{formatEuros(inv.total_ttc_cents)}</dd></div>
        </dl>

        <footer className="mt-12 space-y-1 text-xs text-muted">
          <p>{isCredit ? "Remboursé" : "Payé"} le {formatDate(inv.issued_at)} — {inv.payment_method}.</p>
          {inv.footer && <p>{inv.footer}</p>}
        </footer>
      </article>
    </main>
  );
}
