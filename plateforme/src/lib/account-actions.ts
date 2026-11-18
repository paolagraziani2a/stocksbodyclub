"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser, type ActionResult } from "@/lib/auth";
import { auth } from "@/lib/auth-server";
import { asUser } from "@/lib/db";
import { errorCode, errorMessage } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";

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

/** Traduit les erreurs Better Auth en messages clairs. */
function authMessage(e: unknown, fallback = "Une erreur est survenue. Réessayez dans un instant.") {
  const code = String((e as { body?: { code?: string } })?.body?.code ?? (e as { status?: string })?.status ?? "");
  if (/INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD|CREDENTIAL/.test(code)) return "Email ou mot de passe incorrect.";
  if (/EMAIL_NOT_VERIFIED/.test(code)) return "Confirmez d'abord votre adresse email : un nouveau lien vient de vous être envoyé.";
  if (/USER_ALREADY_EXISTS/.test(code)) return "Un compte existe déjà avec cet email. Connectez-vous ou choisissez « Mot de passe oublié ».";
  if (/PASSWORD_TOO_SHORT|PASSWORD_TOO_LONG/.test(code)) return "Mot de passe : 8 caractères minimum, avec des lettres et des chiffres.";
  if (/INVALID_TOKEN|TOKEN_EXPIRED/.test(code)) return "Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.";
  if (/TOO_MANY|RATE/.test(code)) return "Trop de tentatives. Patientez quelques minutes.";
  return fallback;
}

// ---------------------------------------------------------------------------
// Connexion / inscription / mot de passe
// ---------------------------------------------------------------------------
export async function signIn(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const pwd = String(form.get("password") ?? "");
  if (!email || !pwd) return { ok: false, message: "Indiquez votre email et votre mot de passe." };

  let userId: string;
  try {
    const r = await auth().api.signInEmail({ body: { email, password: pwd, callbackURL: "/compte" }, headers: await headers() });
    userId = r.user.id;
  } catch (e) {
    return { ok: false, message: authMessage(e, "Email ou mot de passe incorrect.") };
  }

  const profile = await asUser(userId, (tx) =>
    tx.one<{ role: string; must_change_password: boolean }>("select role, must_change_password from public.profiles where id = auth.uid()"));
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
  const next = safeNext(form.get("suite"));

  let signedIn = false;
  try {
    const r = await auth().api.signUpEmail({
      body: {
        email: v.email, password: v.password, name: `${v.first_name} ${v.last_name}`,
        firstName: v.first_name, lastName: v.last_name, phone: v.phone, smsOptIn: v.sms_opt_in, termsAccepted: true,
        callbackURL: next ?? "/compte?bienvenue=1",
      },
      headers: await headers(),
    });
    signedIn = !!r.token;
  } catch (e) {
    return { ok: false, message: authMessage(e) };
  }
  // Confirmation d'email activée : pas de session tant que le lien n'est pas cliqué
  if (!signedIn) {
    return { ok: true, message: "Presque fini ! Nous vous avons envoyé un email : cliquez sur le lien pour activer votre compte." };
  }
  redirect(next ?? "/compte?bienvenue=1");
}

export async function requestPasswordReset(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, message: "Adresse email invalide." };
  try {
    await auth().api.requestPasswordReset({ body: { email, redirectTo: "/reinitialiser" }, headers: await headers() });
  } catch (e) {
    if (/TOO_MANY|RATE/.test(String((e as { body?: { code?: string } })?.body?.code ?? ""))) return { ok: false, message: authMessage(e) };
  }
  // Même réponse que le compte existe ou non (on ne révèle pas qui est inscrite)
  return { ok: true, message: "Si un compte existe avec cet email, vous allez recevoir un lien pour choisir un nouveau mot de passe." };
}

/**
 * Nouveau mot de passe :
 *  - avec le lien reçu par email (jeton) : la cliente n'a pas besoin de l'ancien ;
 *  - connectée (changement volontaire, ou mot de passe temporaire donné par le studio) : mot de passe actuel requis.
 */
export async function updatePassword(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = z.object({ password, confirm: z.string(), token: z.string().optional(), current: z.string().optional() })
    .refine((v) => v.password === v.confirm, { message: "Les deux mots de passe ne correspondent pas." })
    .safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { password: newPassword, token, current } = parsed.data;

  if (token) {
    try {
      await auth().api.resetPassword({ body: { newPassword, token } });
    } catch (e) {
      return { ok: false, message: authMessage(e) };
    }
    redirect("/connexion?mdp=1");
  }

  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Votre lien a expiré. Demandez-en un nouveau." };
  if (!current) return { ok: false, message: "Indiquez votre mot de passe actuel." };
  if (current === newPassword) return { ok: false, message: "Choisissez un mot de passe différent de l'actuel." };
  try {
    await auth().api.changePassword({ body: { currentPassword: current, newPassword, revokeOtherSessions: true }, headers: await headers() });
  } catch (e) {
    return { ok: false, message: authMessage(e, "Mot de passe actuel incorrect.") };
  }
  await asUser(user.id, (tx) => tx.run("select public.clear_must_change_password()"));
  redirect("/compte?mdp=1");
}

export async function signOut() {
  await auth().api.signOut({ headers: await headers() }).catch(() => {});
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

  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  try {
    await asUser(user.id, (tx) => tx.run(
      "update public.profiles set first_name = $1, last_name = $2, phone = $3, sms_opt_in = $4 where id = auth.uid()",
      [parsed.data.first_name, parsed.data.last_name, phone, parsed.data.sms_opt_in]));
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
  revalidatePath("/compte");
  return { ok: true, message: "Vos informations sont enregistrées." };
}

// ---------------------------------------------------------------------------
// Réservations (les règles sont appliquées par la base : capacité, crédits, délais)
// ---------------------------------------------------------------------------
const uuid = z.string().uuid();

async function rpc(sql: string, arg: FormDataEntryValue | null): Promise<{ ok: true; data: unknown } | { ok: false; result: ActionResult }> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion?suite=/planning");
  const id = uuid.safeParse(arg);
  if (!id.success) return { ok: false, result: { ok: false, message: "Cours introuvable." } };
  try {
    const row = await asUser(user.id, (tx) => tx.one<{ r: unknown }>(sql, [id.data]));
    revalidatePath("/planning");
    revalidatePath("/compte");
    return { ok: true, data: row?.r };
  } catch (e) {
    if (errorCode(e) === "NO_CREDITS") return { ok: false, result: { ok: false, message: "NO_CREDITS" } };
    return { ok: false, result: { ok: false, message: errorMessage(e) } };
  }
}

export async function bookSession(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const r = await rpc("select to_jsonb(public.book_session($1)) as r", form.get("session"));
  return r.ok ? { ok: true, message: "C'est réservé ! À très vite au studio." } : r.result;
}

export async function cancelMyBooking(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const r = await rpc("select public.cancel_booking($1) as r", form.get("booking"));
  if (!r.ok) return r.result;
  const refunded = (r.data as { credit_refunded: boolean }).credit_refunded;
  // Depuis « Mon compte », la ligne disparaît : on affiche la confirmation en haut de la page
  if (form.get("from") === "compte") redirect(`/compte?annulation=${refunded ? "remboursee" : "tardive"}`);
  return { ok: true, message: refunded ? "Réservation annulée, votre crédit vous a été rendu." : "Réservation annulée. Annulation tardive : le cours est dû." };
}

export async function joinWaitlist(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const r = await rpc("select to_jsonb(public.join_waitlist($1)) as r", form.get("session"));
  return r.ok ? { ok: true, message: "Vous êtes sur la liste d'attente : nous vous prévenons dès qu'une place se libère." } : r.result;
}

export async function leaveWaitlist(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const r = await rpc("select public.leave_waitlist($1) as r", form.get("session"));
  return r.ok ? { ok: true, message: "Vous avez quitté la liste d'attente." } : r.result;
}
