"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminRun, requireAdmin, type ActionResult } from "@/lib/auth";
import { hasFile, uploadImage } from "@/lib/storage";

const schema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().min(1, "Le nom est obligatoire").max(60),
  headline: z.string().trim().max(80).default(""),
  quote: z.string().trim().max(200).default(""),
  bio: z.string().trim().max(3000).default(""),
  specialties: z.string().trim().max(300).default(""),
  certifications: z.string().trim().max(500).default(""),
  instagram_url: z.string().trim().url("Lien Instagram invalide").startsWith("https://", "Le lien doit commencer par https://").or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
  show_on_site: z.preprocess((v) => v === "on", z.boolean()),
});
const disciplinesSchema = z.array(z.enum(["lagree", "yoga", "mat_pilates"])).min(1, "Cochez au moins une discipline.");

export async function saveTeacherProfile(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id, specialties, ...rest } = parsed.data;
  const disciplines = disciplinesSchema.safeParse(form.getAll("disciplines"));
  if (!disciplines.success) return { ok: false, message: disciplines.error.issues[0].message };

  const update: Record<string, unknown> = {
    ...rest,
    disciplines: disciplines.data,
    bio: rest.bio || null,
    // « Sculpt, Core , Débutantes » → ["Sculpt", "Core", "Débutantes"]
    specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8),
  };
  try {
    const photo = form.get("photo");
    if (form.get("photo_remove") === "on") update.photo_url = null;
    else if (hasFile(photo)) update.photo_url = await uploadImage(photo, "coachs");
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  const r = await adminRun(async (tx) => {
    await tx.update("public.teachers", update, id);
    return tx.one<{ slug: string }>("select slug from public.teachers where id = $1", [id]);
  });
  if (!r.ok || !r.data) return { ok: false, message: r.ok ? "Professeur introuvable." : r.message };
  const data = r.data;
  revalidatePath("/coachs");
  revalidatePath(`/coachs/${data.slug}`);
  revalidatePath("/");
  revalidatePath(`/admin/professeurs/${id}`);
  return { ok: true, message: "Profil enregistré." };
}
