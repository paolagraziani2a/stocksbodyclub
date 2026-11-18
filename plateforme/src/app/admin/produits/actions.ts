"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminRun, type ActionResult } from "@/lib/auth";

const euros = z.coerce.number().min(0).max(10000).transform((v) => Math.round(v * 100));

const schema = z.object({
  name: z.string().trim().min(1, "Indiquez un nom.").max(60),
  description: z.string().trim().max(300).default(""),
  price: euros,
  credits: z.coerce.number().int().min(0).max(200),
  validity_value: z.coerce.number().int().min(1, "La validité doit être d'au moins 1.").max(36),
  validity_unit: z.enum(["day", "month"]),
  sort_order: z.coerce.number().int().min(0).max(99).default(0),
  active: z.preprocess((v) => v === "on", z.boolean()),
});

function refresh() {
  revalidatePath("/admin/produits");
  revalidatePath("/tarifs");
  revalidatePath("/");
}

/**
 * Les changements ne s'appliquent qu'aux prochains achats : chaque carte déjà
 * achetée garde le prix, le nombre de crédits et la durée de validité du jour de l'achat.
 */
export async function saveProduct(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = schema.extend({ id: z.string().uuid().optional() }).safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, price, ...v } = parsed.data;

  const row = { ...v, price_cents: price, description: v.description || null };
  const r = await adminRun(async (tx) => {
    const current = id ? await tx.one<{ is_unlimited: boolean }>("select is_unlimited from public.products where id = $1", [id]) : null;
    if (!current?.is_unlimited && v.credits < 1) return "no_credits";
    if (id) await tx.update("public.products", row, id); else await tx.insert("public.products", row);
    return "ok";
  });
  if (!r.ok) return { ok: false, message: r.message };
  if (r.data === "no_credits") return { ok: false, message: "Une carte doit contenir au moins 1 cours." };
  refresh();
  return { ok: true, message: id ? "Enregistré. S'applique aux prochains achats." : "Carte créée." };
}
