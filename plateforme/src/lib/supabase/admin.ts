import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Client « service_role » : contourne la RLS.
 * À n'utiliser QUE dans les webhooks Stripe, les tâches planifiées et l'import.
 * L'import "server-only" fait échouer la compilation s'il est importé côté navigateur.
 */
export function createServiceClient() {
  return createClient(publicEnv.supabaseUrl, serverEnv().supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
