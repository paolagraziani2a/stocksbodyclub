"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, type ActionResult } from "@/lib/auth";
import { parisDay } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const ruleSchema = z.object({
  mode: z.enum(["percent", "fixed_per_class", "per_attendee", "none"]),
  value: z.coerce.number().min(0).max(100000).default(0),
});

/** Convertit la saisie (pourcentage ou euros) en règle stockée. */
function toRule(mode: z.infer<typeof ruleSchema>["mode"], value: number) {
  return {
    mode,
    percent: mode === "percent" ? Math.min(value, 100) : null,
    fixed_cents: mode === "fixed_per_class" ? Math.round(value * 100) : null,
    per_attendee_cents: mode === "per_attendee" ? Math.round(value * 100) : null,
  };
}

export async function createTeacher(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ruleSchema.extend({ name: z.string().trim().min(1, "Indiquez un nom").max(60) })
    .safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { name, mode, value } = parsed.data;

  const supabase = await createClient();
  const { data: t, error } = await supabase.from("teachers").insert({ display_name: name }).select("id").single();
  if (error) return { ok: false, message: errorMessage(error) };
  const { error: e2 } = await supabase.from("teacher_pay_rules")
    .insert({ teacher_id: t.id, valid_from: "2000-01-01", ...toRule(mode, value) });
  if (e2) return { ok: false, message: errorMessage(e2) };
  revalidatePath("/admin/professeurs");
  return { ok: true, message: `${name} a été ajouté(e).` };
}

/** Nouvelle règle à partir d'aujourd'hui : les mois passés gardent l'ancien taux. */
export async function setPayRule(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ruleSchema.extend({ teacher: z.string().uuid() }).safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { teacher, mode, value } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("teacher_pay_rules").upsert(
    { teacher_id: teacher, valid_from: parisDay(), ...toRule(mode, value) },
    { onConflict: "teacher_id,valid_from" },
  );
  if (error) return { ok: false, message: errorMessage(error) };
  revalidatePath("/admin/professeurs");
  return { ok: true, message: "Rémunération mise à jour à partir d'aujourd'hui." };
}

export async function setTeacherActive(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("teacher"));
  const active = form.get("active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("teachers").update({ active }).eq("id", id);
  if (error) return { ok: false, message: errorMessage(error) };
  revalidatePath("/admin/professeurs");
  return { ok: true };
}
