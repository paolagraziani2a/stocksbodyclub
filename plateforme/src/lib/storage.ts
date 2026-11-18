import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Vrai si le champ de formulaire contient un fichier choisi. */
export function hasFile(v: FormDataEntryValue | null): v is File {
  return v instanceof File && v.size > 0;
}

/**
 * Enregistre une image publique (logo, photos du studio, portraits des coachs).
 * Production : Vercel Blob (BLOB_READ_WRITE_TOKEN). Développement sans jeton : dossier public/uploads.
 * SVG refusé : un SVG peut contenir du script. Contrôle admin fait par l'action appelante.
 */
export async function uploadImage(file: File, prefix: string): Promise<string> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Format accepté : JPG, PNG ou WebP.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image trop lourde (5 Mo maximum).");
  const name = `${prefix}/${randomUUID()}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(name, file, { access: "public", contentType: file.type, addRandomSuffix: false, cacheControlMaxAge: 31536000 });
      return blob.url;
    } catch {
      throw new Error("Envoi de l'image impossible.");
    }
  }
  if (process.env.NODE_ENV === "production") throw new Error("Stockage des photos non configuré (Vercel Blob).");
  const dir = path.join(process.cwd(), "public", "uploads", prefix);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), "public", "uploads", name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}
