import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth-server";
import { asUser, asViewer, type Tx } from "./db";

export type Profile = {
  id: string; role: "client" | "teacher" | "admin"; email: string; first_name: string; last_name: string;
  phone: string | null; sms_opt_in: boolean; must_change_password: boolean; marketing_consent: boolean;
  anonymized_at: string | null; created_at: string;
};

/** Personne connectée (session Better Auth vérifiée côté serveur), une fois par requête. */
export const getSessionUser = cache(async () => {
  const session = await auth().api.getSession({ headers: await headers() }).catch(() => null);
  return session?.user ?? null;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  return asUser(user.id, (tx) => tx.one<Profile>("select * from public.profiles where id = auth.uid()"));
});

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

/** Requêtes au nom de l'admin connectée (RLS + contrôles des fonctions métier). */
export async function adminTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const admin = await requireAdmin();
  return asUser(admin.id, fn);
}

/** Requêtes au nom de la personne connectée, ou d'un visiteur anonyme. */
export async function viewerTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const user = await getSessionUser();
  return asViewer(user?.id, fn);
}

export type ActionResult = { ok: boolean; message?: string } | null;

/** Comme adminTx, mais transforme une erreur métier en message clair (pour les actions). */
export async function adminRun<T>(fn: (tx: Tx) => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; message: string; code: string }> {
  const admin = await requireAdmin();
  try {
    return { ok: true, data: await asUser(admin.id, fn) };
  } catch (e) {
    const { errorMessage } = await import("./errors");
    return { ok: false, message: errorMessage(e), code: String((e as Error)?.message ?? "").split(/[\s:]/)[0] };
  }
}
