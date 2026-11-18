import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Vrai si le champ de formulaire contient un fichier choisi. */
export function hasFile(v: FormDataEntryValue | null): v is File {
  return v instanceof File && v.size > 0;
}

/**
 * Envoie une image dans le stockage public « site » (écriture réservée à l'admin par la RLS).
 * SVG refusé : un SVG peut contenir du script.
 */
export async function uploadImage(supabase: SupabaseClient, file: File, prefix: string): Promise<string> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Format accepté : JPG, PNG ou WebP.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image trop lourde (5 Mo maximum).");
  const path = `${prefix}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("site").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) throw new Error("Envoi de l'image impossible.");
  return supabase.storage.from("site").getPublicUrl(path).data.publicUrl;
}
