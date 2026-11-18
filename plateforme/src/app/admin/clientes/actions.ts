"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { adminRun, requireAdmin, type ActionResult } from "@/lib/auth";
import { auth } from "@/lib/auth-server";
import { asService } from "@/lib/db";

const id = z.string().uuid();

/**
 * Mot de passe temporaire lisible à dicter ou envoyer (« Lagree-4827-kv »).
 * Les mots de passe ne sont JAMAIS lisibles : seule une empreinte est stockée.
 * L'admin peut seulement en définir un nouveau, affiché une seule fois.
 */
function temporaryPassword() {
  const words = ["Lagree", "Studio", "Corse", "Sculpt", "Megaformer", "Pilates"];
  const letters = "abcdefghjkmnpqrstuvwxyz";
  return `${words[randomInt(words.length)]}-${String(randomInt(1000, 9999))}-${letters[randomInt(letters.length)]}${letters[randomInt(letters.length)]}`;
}

async function audit(action: string, userId: string, actorId: string) {
  await asService((tx) => tx.run(
    "insert into public.audit_log (actor_id, action, entity, entity_id, diff) values ($1, $2, 'profiles', $3, '{}'::jsonb)",
    [actorId, action, userId]));
}

export async function sendResetLink(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = id.parse(form.get("user"));
  const client = await asService((tx) => tx.one<{ email: string }>("select email from public.profiles where id = $1", [userId]));
  if (!client) return { ok: false, message: "Cliente introuvable." };
  try {
    await auth().api.requestPasswordReset({ body: { email: client.email, redirectTo: "/reinitialiser" }, headers: await headers() });
  } catch {
    return { ok: false, message: "Envoi impossible pour le moment. Réessayez dans quelques minutes." };
  }
  await audit("admin_send_reset_link", userId, admin.id);
  return { ok: true, message: `Lien envoyé à ${client.email}. Il est valable une heure.` };
}

export async function setTemporaryPassword(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = id.parse(form.get("user"));
  if (userId === admin.id) return { ok: false, message: "Pour votre propre compte, utilisez « Mot de passe oublié »." };

  const pwd = temporaryPassword();
  const hash = await (await auth().$context).password.hash(pwd);
  const done = await asService(async (tx) => {
    const target = await tx.one<{ role: string }>("select role from public.profiles where id = $1", [userId]);
    if (!target) return "absent";
    if (target.role === "admin") return "admin";
    const n = await tx.run(
      "update auth.accounts set password = $2, updated_at = now() where user_id = $1 and provider_id = 'credential'", [userId, hash]);
    if (n === 0) {
      await tx.run(
        "insert into auth.accounts (user_id, account_id, provider_id, password) values ($1, $2, 'credential', $3)", [userId, userId, hash]);
    }
    // l'admin se porte garante de l'adresse ; toutes ses sessions ouvertes sont fermées
    await tx.run("update auth.users set email_verified = true where id = $1", [userId]);
    await tx.run("delete from auth.sessions where user_id = $1", [userId]);
    await tx.run("update public.profiles set must_change_password = true where id = $1", [userId]);
    return "ok";
  });
  if (done === "absent") return { ok: false, message: "Cliente introuvable." };
  if (done === "admin") return { ok: false, message: "Impossible pour un compte administrateur." };
  await audit("admin_temporary_password", userId, admin.id); // le mot de passe n'est jamais journalisé
  revalidatePath(`/admin/clientes/${userId}`);
  return {
    ok: true,
    message: `Mot de passe temporaire : ${pwd} — communiquez-le à la cliente. Il ne sera plus affiché ; elle devra en choisir un nouveau à sa prochaine connexion.`,
  };
}

export async function sellProduct(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = z.object({
    user: id, product: id,
    method: z.enum(["studio_card", "cash", "transfer", "gift"]),
  }).safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: "Choisissez une carte et un moyen de paiement." };
  const { user, product, method } = parsed.data;

  const r = await adminRun(async (tx) => {
    if (method !== "gift") {
      await tx.run("select public.admin_sell_product($1, $2, $3)", [user, product, method]);
      return "sold";
    }
    const p = await tx.one<{ id: string; name: string; credits: number; validity_value: number; validity_unit: string; is_unlimited: boolean }>(
      "select id, name, credits, validity_value, validity_unit, is_unlimited from public.products where id = $1", [product]);
    if (!p) return "missing";
    if (p.is_unlimited) return "unlimited";
    await tx.run(
      `select public.admin_grant_pass(p_user_id => $1, p_name => $2, p_credits => $3, p_validity_value => $4,
         p_validity_unit => $5::public.validity_unit, p_unit_value_cents => 0, p_product_id => $6, p_note => 'Carte offerte')`,
      [user, `${p.name} (offerte)`, p.credits, p.validity_value, p.validity_unit, p.id]);
    return "gift";
  });
  if (!r.ok) return { ok: false, message: r.message };
  if (r.data === "missing") return { ok: false, message: "Carte introuvable." };
  if (r.data === "unlimited") return { ok: false, message: "Pour offrir un mois d'illimité, enregistrez une vente avec une remise totale." };
  revalidatePath(`/admin/clientes/${user}`);
  return { ok: true, message: r.data === "gift" ? "Carte offerte ajoutée." : "Vente enregistrée : carte créditée et facture émise." };
}

export async function adjustPass(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = z.object({ pass: id, user: id, delta: z.coerce.number().int().min(-50).max(50), note: z.string().trim().min(1, "Indiquez un motif.").max(200) })
    .safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (parsed.data.delta === 0) return { ok: false, message: "Indiquez un nombre de crédits (ex. 1 ou -1)." };
  const r = await adminRun((tx) => tx.run("select public.admin_adjust_pass($1, $2, $3)", [parsed.data.pass, parsed.data.delta, parsed.data.note]));
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/admin/clientes/${parsed.data.user}`);
  return { ok: true, message: "Crédits corrigés." };
}
