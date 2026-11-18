import type { Metadata } from "next";
import Link from "next/link";
import { Card, Empty, Input, PageHeader, Table, buttonStyles } from "@/components/ui";
import { adminTx, requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = { title: "Clientes" };

type Row = {
  id: string; first_name: string; last_name: string; email: string; phone: string | null; created_at: string;
  passes: { credits_remaining: number; expires_at: string | null; is_unlimited: boolean; revoked_at: string | null }[];
};

export default async function ClientsPage({ searchParams }: PageProps<"/admin/clientes">) {
  await requireAdmin();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 60) : "";
  // recherche par nom, email ou téléphone (requête paramétrée : aucune injection possible)
  const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const digits = query.replace(/\D/g, "").replace(/^0/, "");
  const data = await adminTx((tx) => tx.many<Row>(
    `select p.id, p.first_name, p.last_name, p.email, p.phone, p.created_at,
            coalesce((select json_agg(json_build_object('credits_remaining', x.credits_remaining, 'expires_at', x.expires_at,
                       'is_unlimited', x.is_unlimited, 'revoked_at', x.revoked_at)) from public.passes x where x.user_id = p.id), '[]') as passes
     from public.profiles p
     where p.role = 'client' and p.anonymized_at is null
       and ($1 = '' or p.first_name ilike $2 or p.last_name ilike $2 or p.email ilike $2
            or (length($3) >= 4 and p.phone like '%' || $3 || '%'))
     order by p.created_at desc limit 100`,
    [query, like, digits]));
  const now = new Date().toISOString();

  return (
    <>
      <PageHeader title="Clientes" subtitle={`${(data ?? []).length}${(data ?? []).length === 100 ? "+" : ""} cliente(s)${query ? ` pour « ${query} »` : ""}`} />
      <form className="mb-6 flex max-w-md gap-2">
        <Input name="q" defaultValue={query} placeholder="Nom, email ou téléphone" aria-label="Rechercher une cliente" />
        <button className={buttonStyles.secondary}>Chercher</button>
      </form>
      <Card>
        {(data ?? []).length === 0 ? <Empty>Aucune cliente trouvée.</Empty> : (
          <Table>
            <thead><tr><th>Cliente</th><th>Téléphone</th><th className="text-right">Crédits</th><th>Inscrite le</th></tr></thead>
            <tbody>
              {(data ?? []).map((c) => {
                const active = c.passes.filter((p) => !p.revoked_at && (!p.expires_at || p.expires_at > now));
                const unlimited = active.some((p) => p.is_unlimited);
                const credits = active.reduce((s, p) => s + p.credits_remaining, 0);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                        {`${c.first_name} ${c.last_name}`.trim() || c.email}
                      </Link>
                      <div className="text-xs text-muted">{c.email}</div>
                    </td>
                    <td className="tabular-nums">{formatPhone(c.phone)}</td>
                    <td className="text-right tabular-nums">{unlimited ? "Illimité" : credits}</td>
                    <td className="tabular-nums">{formatDate(c.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
