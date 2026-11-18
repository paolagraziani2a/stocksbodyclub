"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminRun, type ActionResult } from "@/lib/auth";
import { parisDay } from "@/lib/dates";

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
  const parsed = ruleSchema.extend({
    name: z.string().trim().min(1, "Indiquez un nom").max(60),
    discipline: z.enum(["lagree", "yoga", "mat_pilates"]),
  }).safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { name, mode, value, discipline } = parsed.data;

  const r = await adminRun(async (tx) => {
    const t = await tx.insert<{ id: string }>("public.teachers", { display_name: name, disciplines: [discipline] });
    await tx.insert("public.teacher_pay_rules", { teacher_id: t.id, valid_from: "2000-01-01", ...toRule(mode, value) });
  });
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/admin/professeurs");
  return { ok: true, message: `${name} a été ajouté(e).` };
}

/** Nouvelle règle à partir d'aujourd'hui : les mois passés gardent l'ancien taux. */
export async function setPayRule(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = ruleSchema.extend({ teacher: z.string().uuid() }).safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { teacher, mode, value } = parsed.data;

  const rule = toRule(mode, value);
  const r = await adminRun((tx) => tx.run(
    `insert into public.teacher_pay_rules (teacher_id, valid_from, mode, percent, fixed_cents, per_attendee_cents)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (teacher_id, valid_from) do update set mode = excluded.mode, percent = excluded.percent,
       fixed_cents = excluded.fixed_cents, per_attendee_cents = excluded.per_attendee_cents`,
    [teacher, parisDay(), rule.mode, rule.percent, rule.fixed_cents, rule.per_attendee_cents]));
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/admin/professeurs");
  return { ok: true, message: "Rémunération mise à jour à partir d'aujourd'hui." };
}

export async function setTeacherActive(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const id = z.string().uuid().parse(form.get("teacher"));
  const active = form.get("active") === "true";
  const r = await adminRun((tx) => tx.update("public.teachers", { active }, id));
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/admin/professeurs");
  return { ok: true };
}
