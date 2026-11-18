import "server-only";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";

/** À appeler en tête de chaque page et action admin. La RLS reste la protection finale. */
export async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/connexion?suite=/admin");
  if (profile.role !== "admin") redirect("/");
  return profile;
}

export async function requireUser() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/connexion");
  return profile;
}

export type ActionResult = { ok: boolean; message?: string } | null;
