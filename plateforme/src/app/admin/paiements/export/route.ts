import { NextResponse, type NextRequest } from "next/server";
import { parisDay } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/** Export CSV des factures et avoirs d'un mois (pour le comptable). Admin uniquement (RLS + contrôle du rôle). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Non connecté", { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return new NextResponse("Accès refusé", { status: 403 });

  const month = request.nextUrl.searchParams.get("mois") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("Mois invalide", { status: 400 });
  const [y, m] = month.split("-").map(Number);

  const { data } = await supabase.from("invoices")
    .select("number, kind, issued_at, buyer, lines, total_ht_cents, total_vat_cents, total_ttc_cents, vat_rate")
    .gte("issued_at", new Date(Date.UTC(y, m - 1, 1, -3)).toISOString())
    .lt("issued_at", new Date(Date.UTC(y, m, 1, 3)).toISOString())
    .order("year").order("kind").order("seq");

  const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  // texte libre neutralisé contre l'injection de formules ; montants laissés tels quels
  const text = (v: string) => `"${v.replace(/"/g, '""').replace(/^[=+\-@\t\r]/, "'$&")}"`;
  const num = (v: string) => `"${v}"`;
  const rows = (data ?? [])
    .filter((i) => parisDay(i.issued_at).startsWith(month))
    .map((i) => [
      text(i.number), text(i.kind === "invoice" ? "Facture" : "Avoir"), num(parisDay(i.issued_at)),
      text(i.buyer?.name ?? ""), text(i.buyer?.email ?? ""),
      text((i.lines as { label: string }[]).map((l) => l.label).join(" + ")),
      num(euros(i.total_ht_cents)), num(String(i.vat_rate).replace(".", ",")),
      num(euros(i.total_vat_cents)), num(euros(i.total_ttc_cents)),
    ].join(";"));

  const header = ["Numéro", "Type", "Date", "Cliente", "Email", "Libellé", "HT", "Taux TVA", "TVA", "TTC"].join(";");
  // BOM UTF-8 : ouverture correcte des accents dans Excel
  const csv = "﻿" + [header, ...rows].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="factures-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
