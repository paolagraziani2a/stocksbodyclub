import type { Metadata } from "next";
import Link from "next/link";
import { Card, Empty, Input, PageHeader, Table, buttonStyles } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clientes" };

type Row = {
  id: string; first_name: string; last_name: string; email: string; phone: string | null; created_at: string;
  passes: { credits_remaining: number; expires_at: string | null; is_unlimited: boolean; revoked_at: string | null }[];
};

export default async function ClientsPage({ searchParams }: PageProps<"/admin/clientes">) {
  await requireAdmin();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 60) : "";
  const supabase = await createClient();

  let req = supabase.from("profiles")
    .select("id, first_name, last_name, email, phone, created_at, passes(credits_remaining, expires_at, is_unlimited, revoked_at)")
    .eq("role", "client").is("anonymized_at", null).order("created_at", { ascending: false }).limit(100);
  if (query) {
    // échappement des caractères spéciaux du filtre PostgREST
    const safe = query.replace(/[%,()*\\]/g, " ");
    const digits = safe.replace(/\D/g, "").replace(/^0/, "");
    req = req.or([`first_name.ilike.%${safe}%`, `last_name.ilike.%${safe}%`, `email.ilike.%${safe}%`, digits.length >= 4 ? `phone.ilike.%${digits}%` : null].filter(Boolean).join(","));
  }
  const { data } = await req.returns<Row[]>();
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
