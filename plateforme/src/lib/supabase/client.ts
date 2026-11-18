import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/** Client navigateur : clé publique (anon) uniquement, protégée par la RLS. */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
