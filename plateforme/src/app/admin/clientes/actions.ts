"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, type ActionResult } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

/**
 * Mot de passe temporaire lisible à dicter ou envoyer (« Lagree-4827-kv »).
 * Les mots de passe ne sont JAMAIS lisibles : Supabase ne garde qu'une empreinte
 * (hachage bcrypt). L'admin peut seulement en définir un nouveau, affiché une seule fois.
 */
function temporaryPassword() {
  const words = ["Lagree", "Studio", "Corse", "Sculpt", "Megaformer", "Pilates"];
  const letters = "abcdefghjkmnpqrstuvwxyz";
  return `${words[randomInt(words.length)]}-${String(randomInt(1000, 9999))}-${letters[randomInt(letters.length)]}${letters[randomInt(letters.length)]}`;
}

async function audit(action: string, userId: string, actorId: string, diff: Record<string, unknown> = {}) {
  await createServiceClient().from("audit_log").insert({ actor_id: actorId, action, entity: "profiles", entity_id: userId, diff });
}

export async function sendResetLink(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = id.parse(form.get("user"));
  const supabase = await createClient();
  const { data: client } = await supabase.from("profiles").select("email").eq("id", userId).single();
  if (!client) return { ok: false, message: "Cliente introuvable." };
  const { error } = await supabase.auth.resetPasswordForEmail(client.email, { redirectTo: `${publicEnv.siteUrl}/reinitialiser` });
  if (error) return { ok: false, message: "Envoi impossible pour le moment. Réessayez dans quelques minutes." };
  await audit("admin_send_reset_link", userId, admin.id);
  return { ok: true, message: `Lien envoyé à ${client.email}. Il est valable une heure.` };
}

export async function setTemporaryPassword(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = id.parse(form.get("user"));
  if (userId === admin.id) return { ok: false, message: "Pour votre propre compte, utilisez « Mot de passe oublié »." };

  const service = createServiceClient();
  const { data: target } = await service.from("profiles").select("role").eq("id", userId).single();
  if (target?.role === "admin") return { ok: false, message: "Impossible pour un compte administrateur." };

  const pwd = temporaryPassword();
  const { error } = await service.auth.admin.updateUserById(userId, { password: pwd });
  if (error) return { ok: false, message: "Modification impossible. Réessayez." };
  await service.from("profiles").update({ must_change_password: true }).eq("id", userId);
  await audit("admin_temporary_password", userId, admin.id); // le mot de passe n'est jamais journalisé
  revalidatePath(`/admin/clientes/${userId}`);
  return {
    ok: true,
    message: `Mot de passe temporaire : ${pwd} — communiquez-le à la cliente. Il ne sera plus affiché ; elle devra en choisir un nouveau à sa prochaine connexion.`,
  };
}

export async function sellProduct(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.object({
    user: id, product: id,
    method: z.enum(["studio_card", "cash", "transfer", "gift"]),
  }).safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: "Choisissez une carte et un moyen de paiement." };
  const { user, product, method } = parsed.data;
  const supabase = await createClient();

  if (method === "gift") {
    const { data: p } = await supabase.from("products").select("*").eq("id", product).single();
    if (!p) return { ok: false, message: "Carte introuvable." };
    if (p.is_unlimited) return { ok: false, message: "Pour offrir un mois d'illimité, enregistrez une vente avec une remise totale." };
    const { error } = await supabase.rpc("admin_grant_pass", {
      p_user_id: user, p_name: `${p.name} (offerte)`, p_credits: p.credits, p_validity_value: p.validity_value,
      p_validity_unit: p.validity_unit, p_unit_value_cents: 0, p_product_id: p.id, p_note: "Carte offerte",
    });
    if (error) return { ok: false, message: errorMessage(error) };
  } else {
    const { error } = await supabase.rpc("admin_sell_product", { p_user_id: user, p_product_id: product, p_payment_method: method });
    if (error) return { ok: false, message: errorMessage(error) };
  }
  revalidatePath(`/admin/clientes/${user}`);
  return { ok: true, message: method === "gift" ? "Carte offerte ajoutée." : "Vente enregistrée : carte créditée et facture émise." };
}

export async function adjustPass(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.object({ pass: id, user: id, delta: z.coerce.number().int().min(-50).max(50), note: z.string().trim().min(1, "Indiquez un motif.").max(200) })
    .safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (parsed.data.delta === 0) return { ok: false, message: "Indiquez un nombre de crédits (ex. 1 ou -1)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_adjust_pass", { p_pass_id: parsed.data.pass, p_delta: parsed.data.delta, p_note: parsed.data.note });
  if (error) return { ok: false, message: errorMessage(error) };
  revalidatePath(`/admin/clientes/${parsed.data.user}`);
  return { ok: true, message: "Crédits corrigés." };
}
