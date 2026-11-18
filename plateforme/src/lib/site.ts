import "server-only";
import { asAnon } from "@/lib/db";
import type { Discipline, Level } from "@/lib/format";

/** Lectures publiques du site (rôle app_anon) : la RLS limite aux données publiques. */

export type Coach = {
  id: string; slug: string; display_name: string; headline: string; bio: string | null; photo_url: string | null;
  specialties: string[]; certifications: string; instagram_url: string; quote: string; disciplines: Discipline[];
};
export type ClassType = {
  id: string; slug: string; name: string; description: string | null; discipline: Discipline; level: Level;
  intensity: 1 | 2 | 3; duration_minutes: number; default_capacity: number; color: string;
};
export type Photo = { id: string; url: string; alt: string };
export type Product = {
  id: string; name: string; description: string | null; credits: number; price_cents: number;
  validity_value: number; validity_unit: "day" | "month"; is_unlimited: boolean; max_per_client: number | null;
};
export type PublicSession = {
  id: string; title: string; starts_at: string; ends_at: string; capacity: number; booked_count: number;
  status: "scheduled" | "cancelled"; teachers: { display_name: string; slug: string; photo_url: string | null } | null;
  class_types: Pick<ClassType, "name" | "slug" | "discipline" | "level" | "intensity" | "color"> | null;
};

const COACH_COLUMNS = "id, slug, display_name, headline, bio, photo_url, specialties, certifications, instagram_url, quote, disciplines";

export async function getCoaches(): Promise<Coach[]> {
  return asAnon((tx) => tx.many<Coach>(
    `select ${COACH_COLUMNS} from public.teachers where active and show_on_site order by sort_order, display_name`));
}

export async function getCoach(slug: string): Promise<Coach | null> {
  return asAnon((tx) => tx.one<Coach>(
    `select ${COACH_COLUMNS} from public.teachers where slug = $1 and active and show_on_site`, [slug]));
}

export async function getClassTypes(): Promise<ClassType[]> {
  return asAnon((tx) => tx.many<ClassType>(
    `select id, slug, name, description, discipline, level, intensity, duration_minutes, default_capacity, color
     from public.class_types where active order by sort_order, name`));
}

export async function getPhotos(): Promise<Photo[]> {
  return asAnon((tx) => tx.many<Photo>("select id, url, alt from public.site_photos order by sort_order, created_at"));
}

export async function getProducts(): Promise<Product[]> {
  return asAnon((tx) => tx.many<Product>(
    `select id, name, description, credits, price_cents, validity_value, validity_unit, is_unlimited, max_per_client
     from public.products where active order by sort_order`));
}

/** Cours entre deux instants ; si teacherId est fourni, uniquement ceux de ce coach. */
export async function getSessions(fromIso: string, toIso: string, teacherId?: string): Promise<PublicSession[]> {
  return asAnon((tx) => tx.many<PublicSession>(
    `select s.id, s.title, s.starts_at, s.ends_at, s.capacity, s.booked_count, s.status,
            case when t.id is null then null else json_build_object('display_name', t.display_name, 'slug', t.slug, 'photo_url', t.photo_url) end as teachers,
            case when ct.id is null then null else json_build_object('name', ct.name, 'slug', ct.slug, 'discipline', ct.discipline,
              'level', ct.level, 'intensity', ct.intensity, 'color', ct.color) end as class_types
     from public.class_sessions s
     left join public.teachers t on t.id = s.teacher_id
     left join public.class_types ct on ct.id = s.class_type_id
     where s.starts_at >= $1 and s.starts_at < $2 and ($3::uuid is null or s.teacher_id = $3)
     order by s.starts_at`,
    [fromIso, toIso, teacherId ?? null]));
}

/** Réglages publics (règles d'annulation, nom du studio). */
export async function getPublicSettings() {
  return asAnon((tx) => tx.one<{ studio_name: string; cancel_window_hours: number; unlimited_late_cancel_limit: number }>(
    "select studio_name, cancel_window_hours, unlimited_late_cancel_limit from public.studio_settings"));
}

export { mapsLink, validityLabel } from "./format";
