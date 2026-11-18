import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { adminTx, requireAdmin, type Profile } from "@/lib/auth";
import { formatDate, formatShortDay, formatTime } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { adjustPass, sellProduct, sendResetLink, setTemporaryPassword } from "../actions";

export const metadata: Metadata = { title: "Fiche cliente" };

const BOOKING: Record<string, { label: string; tone: "neutral" | "success" | "danger" | "accent" }> = {
  booked: { label: "Réservé", tone: "neutral" }, attended: { label: "Présente", tone: "success" },
  no_show: { label: "Absente", tone: "danger" }, late_cancelled: { label: "Annul. tardive", tone: "danger" },
  cancelled: { label: "Annulé", tone: "accent" },
};

export default async function ClientPage({ params }: PageProps<"/admin/clientes/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { c, passes, bookings, products, orders } = await adminTx(async (tx) => ({
    c: await tx.one<Profile>("select * from public.profiles where id = $1", [id]),
    passes: await tx.many<{
      id: string; name: string; is_unlimited: boolean; credits_total: number; credits_remaining: number;
      unit_value_cents: number; expires_at: string | null; revoked_at: string | null;
    }>("select * from public.passes where user_id = $1 order by created_at desc", [id]),
    bookings: await tx.many<{ id: string; status: string; class_sessions: { title: string; starts_at: string } }>(
      `select b.id, b.status, json_build_object('title', s.title, 'starts_at', s.starts_at) as class_sessions
       from public.bookings b join public.class_sessions s on s.id = b.session_id
       where b.user_id = $1 order by b.created_at desc limit 20`, [id]),
    products: await tx.many<{ id: string; name: string; price_cents: number }>(
      "select id, name, price_cents from public.products where active order by sort_order"),
    orders: await tx.many<{ id: string; product_name: string; amount_total_cents: number; paid_at: string; payment_method: string; invoices: { id: string; number: string; kind: string }[] }>(
      `select o.id, o.product_name, o.amount_total_cents, o.paid_at, o.payment_method,
              coalesce((select json_agg(json_build_object('id', i.id, 'number', i.number, 'kind', i.kind)) from public.invoices i where i.order_id = o.id), '[]') as invoices
       from public.orders o where o.user_id = $1 and o.paid_at is not null order by o.paid_at desc`, [id]),
  }));
  if (!c) notFound();

  return (
    <>
      <Link href="/admin/clientes" className="text-sm text-muted hover:text-ink">← Clientes</Link>
      <PageHeader
        title={`${c.first_name} ${c.last_name}`.trim() || c.email}
        subtitle={<>{c.email} · {formatPhone(c.phone) || "pas de téléphone"} · inscrite le {formatDate(c.created_at)}</>}
        actions={<>
          {!c.sms_opt_in && <Badge>SMS refusés</Badge>}
          {c.must_change_password && <Badge tone="accent">Mot de passe temporaire</Badge>}
        </>}
      />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-2xl">Cartes</h2>
            {(passes ?? []).length === 0 ? <Empty>Aucune carte.</Empty> : (
              <Table>
                <thead><tr><th>Carte</th><th className="text-right">Crédits</th><th>Validité</th><th>Corriger</th></tr></thead>
                <tbody>
                  {(passes ?? []).map((p) => (
                    <tr key={p.id} className={p.revoked_at ? "opacity-50" : ""}>
                      <td>{p.name}{Number(p.unit_value_cents) === 0 ? <span className="ml-2"><Badge tone="accent">Offerte</Badge></span> : null}</td>
                      <td className="text-right tabular-nums">{p.is_unlimited ? "∞" : `${p.credits_remaining}/${p.credits_total}`}</td>
                      <td className="text-sm">{p.revoked_at ? "Remboursée" : p.expires_at ? `jusqu'au ${formatDate(new Date(new Date(p.expires_at).getTime() - 1000))}` : "Non activée"}</td>
                      <td>
                        {!p.is_unlimited && !p.revoked_at && (
                          <ActionForm action={adjustPass} className="flex gap-1">
                            <input type="hidden" name="pass" value={p.id} />
                            <input type="hidden" name="user" value={c.id} />
                            <Input name="delta" type="number" min={-50} max={50} placeholder="±1" className="w-16 px-2 py-1.5 text-xs" aria-label="Crédits à ajouter ou retirer" />
                            <Input name="note" placeholder="Motif" className="w-28 px-2 py-1.5 text-xs" aria-label="Motif" />
                            <SubmitButton variant="ghost" className="px-2 py-1 text-xs">OK</SubmitButton>
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <h2 className="text-2xl">Cours</h2>
            {(bookings ?? []).length === 0 ? <Empty>Aucune réservation.</Empty> : (
              <ul className="mt-4 divide-y divide-line text-sm">
                {(bookings ?? []).map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2.5">
                    <span className="capitalize">{formatShortDay(b.class_sessions.starts_at)} · {formatTime(b.class_sessions.starts_at)} · {b.class_sessions.title}</span>
                    <Badge tone={BOOKING[b.status]?.tone}>{BOOKING[b.status]?.label ?? b.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-2xl">Achats et factures</h2>
            {(orders ?? []).length === 0 ? <Empty>Aucun achat.</Empty> : (
              <ul className="mt-4 divide-y divide-line text-sm">
                {(orders ?? []).map((o) => {
                  const inv = o.invoices.find((i) => i.kind === "invoice");
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span>{formatDate(o.paid_at)} · {o.product_name}</span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums">{formatEuros(o.amount_total_cents)}</span>
                        {inv && <Link href={`/factures/${inv.id}`} className="text-xs underline underline-offset-4">{inv.number}</Link>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-2xl">Vendre ou offrir une carte</h2>
            <ActionForm action={sellProduct} className="mt-5 flex flex-col gap-4">
              <input type="hidden" name="user" value={c.id} />
              <Field label="Carte">
                <Select name="product" required defaultValue="">
                  <option value="" disabled>Choisir…</option>
                  {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} — {formatEuros(p.price_cents)}</option>)}
                </Select>
              </Field>
              <Field label="Paiement">
                <Select name="method" defaultValue="studio_card">
                  <option value="studio_card">Carte bancaire au studio</option>
                  <option value="cash">Espèces</option>
                  <option value="transfer">Virement</option>
                  <option value="gift">Offerte (le coach est payé au prix public)</option>
                </Select>
              </Field>
              <SubmitButton>Enregistrer</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <h2 className="text-2xl">Mot de passe</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Les mots de passe sont chiffrés de façon irréversible : personne ne peut les lire, pas même le studio
              (protection des données, RGPD). Vous pouvez en revanche aider la cliente :
            </p>
            <ActionForm action={sendResetLink} className="mt-5">
              <input type="hidden" name="user" value={c.id} />
              <SubmitButton variant="secondary" className="w-full">Envoyer un lien de réinitialisation</SubmitButton>
            </ActionForm>
            <ActionForm action={setTemporaryPassword} className="mt-3"
              confirm="Remplacer son mot de passe par un mot de passe temporaire ? Elle devra en choisir un nouveau à sa prochaine connexion.">
              <input type="hidden" name="user" value={c.id} />
              <SubmitButton variant="ghost" className="w-full">Créer un mot de passe temporaire</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
