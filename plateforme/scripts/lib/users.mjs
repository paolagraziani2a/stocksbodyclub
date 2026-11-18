// Création de comptes directement en base (scripts d'administration), au même format que Better Auth.
import { hashPassword } from "better-auth/crypto";

/**
 * Crée un compte (email vérifié) + son mot de passe haché ; le profil est créé par déclencheur.
 * Renvoie l'identifiant.
 */
export async function createAccount(db, { email, password, firstName, lastName, phone = null, role = "client", mustChange = false }) {
  const { rows: [u] } = await db.query(
    `insert into auth.users (email, name, email_verified, first_name, last_name, phone, sms_opt_in, terms_accepted)
     values (lower($1), $2, true, $3, $4, $5, true, true) returning id`,
    [email, `${firstName} ${lastName}`.trim(), firstName, lastName, phone]);
  await db.query(
    "insert into auth.accounts (user_id, account_id, provider_id, password) values ($1, $2, 'credential', $3)",
    [u.id, String(u.id), await hashPassword(password)]);
  await db.query("update public.profiles set role = $2, must_change_password = $3 where id = $1", [u.id, role, mustChange]);
  return u.id;
}
