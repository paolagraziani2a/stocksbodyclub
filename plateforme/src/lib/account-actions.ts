"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { errorCode, errorMessage } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

/** N'autorise qu'une redirection interne (évite les redirections ouvertes). */
function safeNext(value: unknown): string | null {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : null;
}

const password = z.string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .max(72, "Mot de passe trop long.")
  .regex(/[A-Za-z]/, "Le mot de passe doit contenir au moins une lettre.")
  .regex(/\d/, "Le mot de passe doit contenir au moins un chiffre.");

function authMessage(code?: string, fallback = "Une erreur est survenue. Réessayez dans un instant.") {
  switch (code) {
    case "invalid_credentials": return "Email ou mot de passe incorrect.";
    case "email_not_confirmed": return "Confirmez d'abord votre adresse email (lien reçu par email).";
    case "user_already_exists":
    case "email_exists": return "Un compte existe déjà avec cet email. Connectez-vous ou choisissez « Mot de passe oublié ».";
    case "weak_password": return "Mot de passe trop faible : au moins 8 caractères, avec des lettres et des chiffres.";
    case "same_password": return "Choisissez un mot de passe différent de l'actuel.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit": return "Trop de tentatives. Patientez quelques minutes.";
    default: return fallback;
  }
}

// ---------------------------------------------------------------------------
// Connexion / inscription / mot de passe
// ---------------------------------------------------------------------------
export async function signIn(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const pwd = String(form.get("password") ?? "");
  if (!email || !pwd) return { ok: false, message: "Indiquez votre email et votre mot de passe." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pwd });
  if (error || !data.user) return { ok: false, message: authMessage(error?.code, "Email ou mot de passe incorrect.") };

  const { data: profile } = await supabase.from("profiles").select("role, must_change_password").eq("id", data.user.id).single();
  if (profile?.must_change_password) redirect("/reinitialiser?temporaire=1");
  const home = profile?.role === "admin" ? "/admin" : profile?.role === "teacher" ? "/prof" : "/compte";
  redirect(safeNext(form.get("suite")) ?? home);
}

const signUpSchema = z.object({
  first_name: z.string().trim().min(1, "Indiquez votre prénom.").max(60),
  last_name: z.string().trim().min(1, "Indiquez votre nom.").max(60),
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  phone: z.string().transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) ctx.addIssue({ code: "custom", message: "Numéro de téléphone invalide (ex. 06 12 34 56 78)." });
    return n ?? "";
  }),
  password,
  confirm: z.string(),
  terms: z.literal("on", { message: "Merci d'accepter les conditions générales." }),
  sms_opt_in: z.preprocess((v) => v === "on", z.boolean()),
}).refine((v) => v.password === v.confirm, { message: "Les deux mots de passe ne correspondent pas.", path: ["confirm"] });

export async function signUp(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/compte`,
      data: {
        first_name: v.first_name, last_name: v.last_name, phone: v.phone,
        terms_accepted: "true", sms_opt_in: v.sms_opt_in,
      },
    },
  });
  if (error) return { ok: false, message: authMessage(error.code) };
  // Avec confirmation d'email activée : pas de session tant que le lien n'est pas cliqué
  if (!data.session) {
    return { ok: true, message: "Presque fini ! Nous vous avons envoyé un email : cliquez sur le lien pour activer votre compte." };
  }
  redirect(safeNext(form.get("suite")) ?? "/compte?bienvenue=1");
}

export async function requestPasswordReset(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, message: "Adresse email invalide." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${publicEnv.siteUrl}/reinitialiser` });
  if (error?.code?.startsWith("over_")) return { ok: false, message: authMessage(error.code) };
  // Même réponse que le compte existe ou non (on ne révèle pas qui est inscrite)
  return { ok: true, message: "Si un compte existe avec cet email, vous allez recevoir un lien pour choisir un nouveau mot de passe." };
}

export async function updatePassword(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = z.object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Les deux mots de passe ne correspondent pas." })
    .safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Votre lien a expiré. Demandez-en un nouveau." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: authMessage(error.code) };
  await supabase.rpc("clear_must_change_password");
  redirect("/compte?mdp=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------
export async function updateProfile(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = z.object({
    first_name: z.string().trim().min(1, "Indiquez votre prénom.").max(60),
    last_name: z.string().trim().min(1, "Indiquez votre nom.").max(60),
    phone: z.string(),
    sms_opt_in: z.preprocess((v) => v === "on", z.boolean()),
  }).safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { ok: false, message: "Numéro de téléphone invalide (ex. 06 12 34 56 78)." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { error } = await supabase.from("profiles").update({ ...parsed.data, phone }).eq("id", user.id);
  if (error) return { ok: false, message: errorMessage(error) };
  revalidatePath("/compte");
  return { ok: true, message: "Vos informations sont enregistrées." };
}

// ---------------------------------------------------------------------------
// Réservations (les règles sont appliquées par la base : capacité, crédits, délais)
// ---------------------------------------------------------------------------
async function rpcAction(fn: string, args: Record<string, string>, ok: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?suite=/planning");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const code = errorCode(error);
    if (code === "NO_CREDITS") return { ok: false, message: "NO_CREDITS" };
    return { ok: false, message: errorMessage(error) };
  }
  revalidatePath("/planning");
  revalidatePath("/compte");
  if (fn === "cancel_booking") {
    const r = data as { credit_refunded: boolean; in_time: boolean };
    return { ok: true, message: r.credit_refunded ? "Réservation annulée, votre crédit vous a été rendu." : "Réservation annulée. Annulation tardive : le cours est dû." };
  }
  return { ok: true, message: ok };
}

export async function bookSession(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return rpcAction("book_session", { p_session_id: String(form.get("session")) }, "C'est réservé ! À très vite au studio.");
}

export async function cancelMyBooking(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const result = await rpcAction("cancel_booking", { p_booking_id: String(form.get("booking")) }, "");
  // Depuis « Mon compte », la ligne disparaît : on affiche la confirmation en haut de la page
  if (result?.ok && form.get("from") === "compte") {
    redirect(`/compte?annulation=${result.message?.includes("rendu") ? "remboursee" : "tardive"}`);
  }
  return result;
}

export async function joinWaitlist(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return rpcAction("join_waitlist", { p_session_id: String(form.get("session")) },
    "Vous êtes sur la liste d'attente : nous vous prévenons dès qu'une place se libère.");
}

export async function leaveWaitlist(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return rpcAction("leave_waitlist", { p_session_id: String(form.get("session")) }, "Vous avez quitté la liste d'attente.");
}
