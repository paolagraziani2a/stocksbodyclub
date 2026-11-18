"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, type ActionResult } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { hasFile, uploadImage } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

const MAX_PHOTOS = 24;

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin/apparence");
}

export async function addPhotos(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const files = form.getAll("photos").filter(hasFile);
  if (files.length === 0) return { ok: false, message: "Choisissez au moins une photo." };

  const supabase = await createClient();
  const { count } = await supabase.from("site_photos").select("id", { count: "exact", head: true });
  if ((count ?? 0) + files.length > MAX_PHOTOS) return { ok: false, message: `${MAX_PHOTOS} photos maximum.` };

  try {
    for (const [i, file] of files.entries()) {
      const url = await uploadImage(supabase, file, "studio");
      const { error } = await supabase.from("site_photos").insert({ url, alt: "", sort_order: (count ?? 0) + i });
      if (error) throw new Error(errorMessage(error));
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  refresh();
  return { ok: true, message: files.length > 1 ? `${files.length} photos ajoutées.` : "Photo ajoutée." };
}

export async function updatePhoto(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const alt = String(form.get("alt") ?? "").trim().slice(0, 150);
  const supabase = await createClient();
  const { error } = await supabase.from("site_photos").update({ alt }).eq("id", id);
  if (error) return { ok: false, message: errorMessage(error) };
  refresh();
  return { ok: true, message: "Enregistré." };
}

export async function deletePhoto(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("site_photos").delete().eq("id", id);
  if (error) return { ok: false, message: errorMessage(error) };
  refresh();
  return { ok: true };
}

/** Déplace une photo d'un cran (renumérote toute la galerie pour rester cohérent). */
export async function movePhoto(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const dir = form.get("dir") === "up" ? -1 : 1;
  const supabase = await createClient();
  const { data } = await supabase.from("site_photos").select("id").order("sort_order").order("created_at");
  const ids = (data ?? []).map((p) => p.id as string);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (const [k, pid] of ids.entries()) {
    const { error } = await supabase.from("site_photos").update({ sort_order: k }).eq("id", pid);
    if (error) return { ok: false, message: errorMessage(error) };
  }
  refresh();
  return { ok: true };
}
