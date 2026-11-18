"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, type ActionResult } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Indiquez un nom.").max(80),
  discipline: z.enum(["lagree", "yoga", "mat_pilates"]),
  level: z.enum(["debutant", "intermediaire", "avance", "tous"]),
  intensity: z.coerce.number().int().min(1).max(3),
  duration_minutes: z.coerce.number().int().min(10, "Durée trop courte.").max(240),
  default_capacity: z.coerce.number().int().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide."),
  description: z.string().trim().max(600).default(""),
  sort_order: z.coerce.number().int().min(0).max(99).default(0),
  active: z.preprocess((v) => v === "on", z.boolean()),
});

export async function saveClassType(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, ...row } = parsed.data;
  const supabase = await createClient();
  const values = { ...row, description: row.description || null };
  const { error } = id
    ? await supabase.from("class_types").update(values).eq("id", id)
    : await supabase.from("class_types").insert(values);
  if (error) return { ok: false, message: error.code === "23505" ? "Un cours porte déjà ce nom." : errorMessage(error) };
  revalidatePath("/admin/cours");
  revalidatePath("/cours");
  revalidatePath("/");
  return { ok: true, message: id ? "Cours enregistré." : "Cours ajouté." };
}
