"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, type ActionResult } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { hasFile, uploadImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide");
const text = (max: number) => z.string().trim().max(max).default("");

const schema = z.object({
  color_background: hex, color_surface: hex, color_text: hex, color_muted: hex, color_accent: hex, color_line: hex,
  heading_font: z.enum(["cormorant", "playfair", "bodoni"]),
  body_font: z.enum(["jost", "inter", "montserrat"]),
  button_shape: z.enum(["pill", "rounded", "square"]),
  hero_kicker: text(60), hero_title: z.string().trim().min(1, "Le titre est obligatoire").max(80),
  hero_subtitle: text(200), about_title: text(80), about_text: text(2000),
  welcome_title: text(80), method_title: text(80), method_text: text(1500),
  opening_hours: text(500), access_info: text(500),
  address: text(200), contact_email: z.string().trim().email("Email invalide").or(z.literal("")),
  contact_phone: text(30),
  instagram_url: z.string().trim().url("Lien Instagram invalide").startsWith("https://", "Le lien doit commencer par https://").or(z.literal("")),
});

export async function saveAppearance(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const update: Record<string, unknown> = { ...parsed.data };
  try {
    for (const [field, prefix] of [["logo", "logo"], ["hero_image", "accueil"]] as const) {
      const file = form.get(field);
      if (form.get(`${field}_remove`) === "on") update[`${field}_url`] = null;
      else if (hasFile(file)) update[`${field}_url`] = await uploadImage(supabase, file, prefix);
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  const { error } = await supabase.from("site_appearance").update(update).eq("id", true);
  if (error) return { ok: false, message: errorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Le site a été mis à jour." };
}
