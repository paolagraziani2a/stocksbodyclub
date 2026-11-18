"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, type ActionResult } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const checkbox = z.preprocess((v) => v === "on", z.boolean());

const schema = z.object({
  studio_name: z.string().trim().min(1).max(80),
  legal_name: z.string().trim().min(1, "Raison sociale obligatoire").max(120),
  legal_form: z.string().trim().max(120),
  legal_address: z.string().trim().max(300),
  siret: z.string().trim().regex(/^(\d{14})?$/, "Le SIRET comporte 14 chiffres").or(z.literal("")),
  vat_number: z.string().trim().max(20),
  invoice_footer: z.string().trim().max(500),
  cancel_window_hours: z.coerce.number().int().min(0).max(168),
  booking_horizon_days: z.coerce.number().int().min(1).max(365),
  vat_rate: z.coerce.number().min(0).max(30),
  teacher_pay_base: z.enum(["ht", "ttc"]),
  late_cancel_counts_for_teacher: checkbox,
  no_show_counts_for_teacher: checkbox,
  unlimited_late_cancel_limit: z.coerce.number().int().min(0).max(20),
  waitlist_enabled: checkbox,
});

export async function saveSettings(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const raw = Object.fromEntries(form.entries());
  raw.siret = String(raw.siret ?? "").replace(/\s/g, "");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("studio_settings").update(parsed.data).eq("id", true);
  if (error) return { ok: false, message: errorMessage(error) };
  revalidatePath("/admin", "layout");
  revalidatePath("/tarifs");
  return { ok: true, message: "Réglages enregistrés." };
}
