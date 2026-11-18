// Données de démonstration pour le Supabase LOCAL uniquement (npx supabase start).
// Usage : npm run demo
// Crée : 1 admin (Pao), 2 professeurs, 12 clientes, 3 semaines de planning, des ventes et des réservations.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const API = "http://127.0.0.1:54321";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant (voir .env.local)");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1")) throw new Error("Refus : ce script ne vise que le Supabase local.");

const supabase = createClient(API, SERVICE_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: DB });
await db.connect();

async function user(email, first, last, role = "client") {
  const { data, error } = await supabase.auth.admin.createUser({
    email, password: "bodyclub-demo", email_confirm: true,
    user_metadata: { first_name: first, last_name: last, terms_accepted: "true" },
  });
  if (error) throw error;
  if (role !== "client") await db.query("update public.profiles set role = $2 where id = $1", [data.user.id, role]);
  return data.user.id;
}

/** Exécute une requête « en tant que » l'utilisatrice (auth.uid()), dans une transaction. */
async function as(uid, sql, params = []) {
  await db.query("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const r = await db.query(sql, params);
    await db.query("commit");
    return r.rows;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

const admin = await user("pao@bodyclub.test", "Pao", "Graziani", "admin");
const camilleUser = await user("camille@bodyclub.test", "Camille", "Martin", "teacher");

await as(admin, `update public.studio_settings set legal_name = 'The Body Club SAS', legal_form = 'SAS au capital de 1 000 €',
  legal_address = '12 rue de l''Exemple, 75000 Paris', siret = '00000000000000', vat_number = 'FR00000000000'`);
const [{ id: camille }] = await as(admin, "insert into public.teachers (display_name, profile_id) values ('Camille', $1) returning id", [camilleUser]);
const [{ id: pao }] = await as(admin, "insert into public.teachers (display_name, profile_id) values ('Pao', $1) returning id", [admin]);
const [{ id: lea }] = await as(admin, "insert into public.teachers (display_name) values ('Léa') returning id");
await as(admin, `insert into public.teacher_pay_rules (teacher_id, mode, percent, valid_from) values
  ($1, 'percent', 40, '2000-01-01'), ($2, 'none', null, '2000-01-01'), ($3, 'percent', 40, '2000-01-01')`, [camille, pao, lea]);

// Planning : semaine dernière → semaine prochaine, 3 créneaux par jour ouvré
const slots = [["07:30", camille], ["12:30", lea], ["19:00", pao]];
const { rows: [{ monday }] } = await db.query("select (date_trunc('week', now() at time zone 'Europe/Paris')::date - 7) as monday");
for (let d = 0; d < 5; d++) {
  for (const [time, teacher] of slots) {
    const day = new Date(monday); day.setDate(day.getDate() + d);
    await as(admin, "select public.admin_create_sessions('Lagree', $1, $2, 50, $3, 8, null, 3)",
      [day.toISOString().slice(0, 10), time, teacher]);
  }
}

// Clientes et achats (paiements Stripe simulés par le même chemin que le webhook)
const names = [["Inès", "Durand"], ["Chloé", "Bernard"], ["Manon", "Petit"], ["Sarah", "Moreau"], ["Julie", "Laurent"],
  ["Emma", "Simon"], ["Clara", "Michel"], ["Léna", "Garcia"], ["Lucie", "Roux"], ["Zoé", "Fournier"], ["Alice", "Girard"], ["Jade", "Bonnet"]];
const products = Object.fromEntries((await db.query("select id, name, price_cents from public.products")).rows.map((p) => [p.name, p]));
const plan = ["Carte 10 cours", "Illimité", "Carte 5 cours", "Carte 10 cours", "Carte 3 cours", "Carte 5 cours",
  "Carte 1 cours", "Carte 10 cours", "Carte 3 cours", "Illimité", "Carte 5 cours", "Carte 1 cours"];
const clients = [];
for (let i = 0; i < names.length; i++) {
  const [first, last] = names[i];
  const uid = await user(`${first.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@client.test`, first, last);
  clients.push(uid);
  const p = products[plan[i]];
  const [order] = await as(uid, "select * from public.create_pending_order($1)", [p.id]);
  const discount = i === 4 ? 990 : 0;
  await db.query("select public.process_checkout_completed($1, 'checkout.session.completed', $2, $3, $4, $5, $6, $7, $8)",
    [`evt_demo_${i}`, order.id, `cs_demo_${i}`, `pi_demo_${i}`, p.price_cents, discount, p.price_cents - discount, discount ? "BIENVENUE10" : null]);
  await db.query("update public.orders set stripe_fee_cents = round(amount_total_cents * 0.015 + 25) where id = $1", [order.id]);
}
// Une carte offerte
await as(admin, `select public.admin_grant_pass(p_user_id => $1, p_name => 'Carte 10 cours offerte', p_credits => 10,
  p_validity_value => 2, p_validity_unit => 'month', p_unit_value_cents => 0, p_product_id => $2, p_note => 'Cadeau fidélité')`,
  [clients[6], products["Carte 10 cours"].id]);

// Réservations : passées (pointées) et à venir
const { rows: sessions } = await db.query(
  "select id, starts_at from public.class_sessions where starts_at between now() - interval '8 days' and now() + interval '7 days' order by starts_at");
let n = 0;
for (const s of sessions) {
  const count = 3 + (n++ % 6);
  for (let k = 0; k < count; k++) {
    const uid = clients[(n + k) % clients.length];
    try {
      await as(admin, "select public.admin_book_session($1, $2)", [s.id, uid]);
    } catch { /* plus de crédit ou complet : ignoré */ }
  }
  if (new Date(s.starts_at) < new Date()) {
    await db.query("update public.bookings set status = 'attended' where session_id = $1 and status = 'booked'", [s.id]);
  }
}
// Un remboursement → avoir
const { rows: [toRefund] } = await db.query("select id from public.orders where product_name = 'Carte 1 cours' and status = 'paid' limit 1");
await db.query("select public.process_refund($1, 're_demo_1', 3500, null, 'Erreur de commande')", [toRefund.id]);

console.log("Données de démonstration créées.");
console.log("Admin : pao@bodyclub.test / bodyclub-demo");
console.log("Professeure : camille@bodyclub.test / bodyclub-demo");
console.log("Cliente : ines@client.test / bodyclub-demo");
await db.end();
