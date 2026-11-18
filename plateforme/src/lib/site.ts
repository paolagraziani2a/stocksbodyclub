import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Discipline, Level } from "@/lib/format";

/** Lectures publiques du site (clé anon, sans cookie). La RLS limite aux données publiques. */
function anon() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { auth: { persistSession: false } });
}

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
  const { data } = await anon().from("teachers").select(COACH_COLUMNS)
    .eq("active", true).eq("show_on_site", true).order("sort_order").order("display_name");
  return (data ?? []) as Coach[];
}

export async function getCoach(slug: string): Promise<Coach | null> {
  const { data } = await anon().from("teachers").select(COACH_COLUMNS)
    .eq("slug", slug).eq("active", true).eq("show_on_site", true).maybeSingle();
  return data as Coach | null;
}

export async function getClassTypes(): Promise<ClassType[]> {
  const { data } = await anon().from("class_types")
    .select("id, slug, name, description, discipline, level, intensity, duration_minutes, default_capacity, color")
    .eq("active", true).order("sort_order").order("name");
  return (data ?? []) as ClassType[];
}

export async function getPhotos(): Promise<Photo[]> {
  const { data } = await anon().from("site_photos").select("id, url, alt").order("sort_order").order("created_at");
  return (data ?? []) as Photo[];
}

export async function getProducts(): Promise<Product[]> {
  const { data } = await anon().from("products")
    .select("id, name, description, credits, price_cents, validity_value, validity_unit, is_unlimited, max_per_client")
    .eq("active", true).order("sort_order");
  return (data ?? []) as Product[];
}

/** Cours entre deux instants ; si teacherSlug est fourni, uniquement ceux de ce coach. */
export async function getSessions(fromIso: string, toIso: string, teacherId?: string): Promise<PublicSession[]> {
  let q = anon().from("class_sessions")
    .select("id, title, starts_at, ends_at, capacity, booked_count, status, teachers(display_name, slug, photo_url), class_types(name, slug, discipline, level, intensity, color)")
    .gte("starts_at", fromIso).lt("starts_at", toIso).order("starts_at");
  if (teacherId) q = q.eq("teacher_id", teacherId);
  const { data } = await q.returns<PublicSession[]>();
  return data ?? [];
}

export { mapsLink, validityLabel } from "./format";
