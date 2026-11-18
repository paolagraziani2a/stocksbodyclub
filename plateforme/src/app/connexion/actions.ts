"use server";

import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** N'autorise qu'une redirection interne (évite les redirections ouvertes). */
function safeNext(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : null;
}

export async function signIn(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, message: "Email ou mot de passe incorrect." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  const home = profile?.role === "admin" ? "/admin" : profile?.role === "teacher" ? "/prof" : "/compte";
  redirect(safeNext(form.get("suite")) ?? home);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}
