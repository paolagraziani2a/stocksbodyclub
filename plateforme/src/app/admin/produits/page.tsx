import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { adminTx, requireAdmin } from "@/lib/auth";
import { formatEuros } from "@/lib/money";
import { saveProduct } from "./actions";

export const metadata: Metadata = { title: "Cartes & tarifs" };

type Product = {
  id: string; name: string; description: string | null; credits: number; price_cents: number; validity_value: number;
  validity_unit: "day" | "month"; is_unlimited: boolean; max_per_client: number | null; active: boolean; sort_order: number;
};

function ProductFields({ p }: { p?: Product }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Nom" className="sm:col-span-2"><Input name="name" defaultValue={p?.name} required maxLength={60} /></Field>
      <Field label="Prix TTC (€)"><Input name="price" type="number" step="0.01" min={0} defaultValue={p ? p.price_cents / 100 : ""} required /></Field>
      <Field label={p?.is_unlimited ? "Cours" : "Nombre de cours"}>
        {p?.is_unlimited
          ? <><Input value="Illimité" disabled /><input type="hidden" name="credits" value="0" /></>
          : <Input name="credits" type="number" min={1} max={200} defaultValue={p?.credits ?? 1} required />}
      </Field>
      <Field label="Validité" hint={p?.is_unlimited ? "À partir du paiement" : "À partir de la 1re réservation"}>
        <div className="flex gap-2">
          <Input name="validity_value" type="number" min={1} max={36} defaultValue={p?.validity_value ?? 1} required className="w-20" />
          <Select name="validity_unit" defaultValue={p?.validity_unit ?? "month"}>
            <option value="month">mois</option>
            <option value="day">jours</option>
          </Select>
        </div>
      </Field>
      <Field label="Description" className="sm:col-span-2"><Input name="description" defaultValue={p?.description ?? ""} maxLength={300} /></Field>
      <Field label="Ordre"><Input name="sort_order" type="number" min={0} max={99} defaultValue={p?.sort_order ?? 0} /></Field>
      <label className="flex items-center gap-2 self-end pb-3 text-sm">
        <input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="h-4 w-4" /> En vente
      </label>
    </div>
  );
}

export default async function ProductsPage() {
  await requireAdmin();
  const data = await adminTx((tx) => tx.many<Product>("select * from public.products order by sort_order"));

  return (
    <>
      <PageHeader
        title="Cartes & tarifs"
        subtitle="Prix, nombre de cours et durée de validité. Une modification ne s'applique qu'aux prochains achats : les cartes déjà achetées gardent leurs conditions."
      />
      <div className="flex flex-col gap-4">
        {(data ?? []).map((p) => (
          <Card key={p.id} data-product={p.name} className={p.active ? "" : "opacity-60"}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-xl">{p.name}</h2>
              <span className="text-sm text-muted">
                {formatEuros(p.price_cents)} · {p.is_unlimited ? "illimité" : `${p.credits} cours`} · valable {p.validity_value} {p.validity_unit === "month" ? "mois" : "jours"}
              </span>
              {p.is_unlimited && <Badge tone="accent">Abonnement</Badge>}
              {p.max_per_client && <Badge>{p.max_per_client} par cliente</Badge>}
              {!p.active && <Badge>Hors vente</Badge>}
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-taupe-deep">Modifier</summary>
              <ActionForm action={saveProduct} className="mt-4">
                <ProductFields p={p} />
                <SubmitButton className="mt-4">Enregistrer</SubmitButton>
              </ActionForm>
            </details>
          </Card>
        ))}
        <Card>
          <h2 className="text-xl">Nouvelle carte</h2>
          <ActionForm action={saveProduct} className="mt-4">
            <ProductFields />
            <SubmitButton className="mt-4">Créer la carte</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
