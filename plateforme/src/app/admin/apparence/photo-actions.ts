"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminRun, requireAdmin, type ActionResult } from "@/lib/auth";
import { hasFile, uploadImage } from "@/lib/storage";

const MAX_PHOTOS = 24;

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin/apparence");
}

export async function addPhotos(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const files = form.getAll("photos").filter(hasFile);
  if (files.length === 0) return { ok: false, message: "Choisissez au moins une photo." };

  const count = await adminRun(async (tx) => (await tx.one<{ n: number }>("select count(*)::int as n from public.site_photos"))?.n ?? 0);
  if (!count.ok) return { ok: false, message: count.message };
  if (count.data + files.length > MAX_PHOTOS) return { ok: false, message: `${MAX_PHOTOS} photos maximum.` };

  try {
    const urls: string[] = [];
    for (const file of files) urls.push(await uploadImage(file, "studio"));
    const r = await adminRun(async (tx) => {
      for (const [i, url] of urls.entries()) await tx.insert("public.site_photos", { url, alt: "", sort_order: count.data + i });
    });
    if (!r.ok) throw new Error(r.message);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  refresh();
  return { ok: true, message: files.length > 1 ? `${files.length} photos ajoutées.` : "Photo ajoutée." };
}

export async function updatePhoto(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const id = z.string().uuid().parse(form.get("id"));
  const alt = String(form.get("alt") ?? "").trim().slice(0, 150);
  const r = await adminRun((tx) => tx.update("public.site_photos", { alt }, id));
  if (!r.ok) return { ok: false, message: r.message };
  refresh();
  return { ok: true, message: "Enregistré." };
}

export async function deletePhoto(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const id = z.string().uuid().parse(form.get("id"));
  const r = await adminRun((tx) => tx.run("delete from public.site_photos where id = $1", [id]));
  if (!r.ok) return { ok: false, message: r.message };
  refresh();
  return { ok: true };
}

/** Déplace une photo d'un cran (renumérote toute la galerie pour rester cohérent). */
export async function movePhoto(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const id = z.string().uuid().parse(form.get("id"));
  const dir = form.get("dir") === "up" ? -1 : 1;
  const r = await adminRun(async (tx) => {
    const ids = (await tx.many<{ id: string }>("select id from public.site_photos order by sort_order, created_at")).map((p) => p.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [k, pid] of ids.entries()) await tx.update("public.site_photos", { sort_order: k }, pid);
  });
  if (!r.ok) return { ok: false, message: r.message };
  refresh();
  return { ok: true };
}
