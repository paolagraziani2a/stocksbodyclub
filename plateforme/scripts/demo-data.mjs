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

let phoneSeq = 10;
async function user(email, first, last, role = "client") {
  const { data, error } = await supabase.auth.admin.createUser({
    email, password: "bodyclub2026", email_confirm: true,
    // numéros fictifs (plage réservée aux fictions par l'ARCEP : 06 39 98 xx xx)
    user_metadata: { first_name: first, last_name: last, terms_accepted: "true", phone: `+336399800${phoneSeq++}` },
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

// Professeures de yoga et de Mat Pilates (fictives)
const [{ id: marie }] = await as(admin, "insert into public.teachers (display_name, disciplines) values ('Marie', '{yoga}') returning id");
const [{ id: elise }] = await as(admin, "insert into public.teachers (display_name, disciplines) values ('Élise', '{yoga,mat_pilates}') returning id");
await as(admin, "update public.teachers set disciplines = '{lagree,mat_pilates}' where id = $1", [lea]);
await as(admin, `insert into public.teacher_pay_rules (teacher_id, mode, percent, valid_from) values
  ($1, 'percent', 40, '2000-01-01'), ($2, 'percent', 40, '2000-01-01')`, [marie, elise]);

// Planning type : semaine dernière → semaine prochaine (3 semaines)
const types = Object.fromEntries((await db.query("select id, name from public.class_types")).rows.map((t) => [t.name, t.id]));
const week = [
  // [jour (0 = lundi), heure, cours, professeure]
  [0, "07:30", "Lagree Full Body Débutant", camille], [0, "12:30", "Lagree Sculpt", lea], [0, "18:30", "Yoga Vinyasa", marie], [0, "19:30", "Lagree Full Body Avancé Intense", pao],
  [1, "07:30", "Lagree Sculpt", camille], [1, "12:30", "Mat Pilates Sculpt", elise], [1, "19:00", "Lagree Avancé Doux", pao],
  [2, "07:30", "Lagree Full Body Avancé Intense", camille], [2, "12:30", "Lagree Full Body Débutant", lea], [2, "18:30", "Yoga Doux", elise], [2, "19:30", "Lagree Sculpt", pao],
  [3, "07:30", "Lagree Avancé Doux", camille], [3, "12:30", "Mat Pilates Sculpt", lea], [3, "19:00", "Lagree Full Body Avancé Intense", pao],
  [4, "07:30", "Lagree Full Body Débutant", camille], [4, "12:30", "Yoga Vinyasa", marie], [4, "20:00", "Lagree Disco Night", pao],
  [5, "09:30", "Lagree Sculpt", camille], [5, "11:00", "Yoga Doux", marie],
];
const { rows: [{ monday }] } = await db.query("select (date_trunc('week', now() at time zone 'Europe/Paris')::date - 7) as monday");
for (const [d, time, name, teacher] of week) {
  const day = new Date(monday); day.setDate(day.getDate() + d);
  await as(admin, "select public.admin_create_sessions(null, $1, $2, null, $3, null, $4, 3)",
    [day.toISOString().slice(0, 10), time, teacher, types[name]]);
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

// Profils des coachs (textes fictifs) et page d'accueil
await as(admin, `update public.teachers set headline = 'Coach Lagree certifiée', sort_order = 1,
  quote = 'Lentement, c''est là que tout se passe.',
  bio = 'Ancienne danseuse, Camille a découvert le Lagree à Londres et ne l''a plus quitté. Ses cours sont précis, exigeants et bienveillants : elle corrige chaque posture pour que vous sentiez exactement le bon muscle travailler.',
  specialties = '{Sculpt,Gainage,Débutantes}', certifications = 'Certification Lagree Fitness (niveau 2)
Diplôme de danse classique'
  where display_name = 'Camille'`);
await as(admin, `update public.teachers set headline = 'Professeure de yoga', sort_order = 4,
  quote = 'Respirer avant de bouger.',
  bio = 'Marie enseigne un yoga vinyasa fluide et un yoga doux tout en écoute. Ses cours sont une parenthèse pour délier le corps et apaiser le mental.',
  specialties = '{Vinyasa,Respiration,Mobilité}', certifications = 'Professeure de yoga certifiée (200 h)'
  where display_name = 'Marie'`);
await as(admin, `update public.teachers set headline = 'Yoga & Mat Pilates', sort_order = 5,
  quote = 'La force naît de la douceur.',
  bio = 'Élise associe le yoga doux et le Pilates au sol pour travailler posture, gainage et souplesse, à un rythme posé.',
  specialties = '{Yoga doux,Mat Pilates,Posture}', certifications = 'Professeure de yoga (200 h)\nFormation Pilates Mat'
  where display_name = 'Élise'`);
await as(admin, `update public.teachers set headline = 'Coach Lagree & préparation physique', sort_order = 2,
  quote = 'Chaque séance vous rend un peu plus forte.',
  bio = 'Léa vient de la préparation physique. Ses cours de midi sont rythmés et efficaces : 50 minutes pour repartir pleine d''énergie.',
  specialties = '{Cardio,Endurance,Express}', certifications = 'Certification Lagree Fitness
BPJEPS Activités de la forme'
  where display_name = 'Léa'`);
await as(admin, `update public.teachers set headline = 'Fondatrice du studio', sort_order = 0,
  quote = 'J''ai créé le studio que j''aurais aimé trouver.',
  bio = 'Passionnée de Lagree, Pao a fondé The Body Club pour proposer une pratique exigeante dans un cadre chaleureux et intimiste. Elle donne les cours du soir.',
  specialties = '{Full body,Sculpt}', certifications = 'Certification Lagree Fitness'
  where display_name = 'Pao'`);
await as(admin, `update public.site_appearance set
  about_text = 'Huit Megaformers, une lumière douce, des coachs certifiés : The Body Club est un studio intimiste dédié au Lagree, où chaque cours se vit comme un moment pour soi.',
  address = '12 rue de l''Exemple
75000 Paris',
  opening_hours = 'Lundi – vendredi : 7h – 21h
Samedi : 9h – 13h',
  access_info = 'Métro ligne 1, station Exemple (3 min à pied).
Vestiaires, douches et serviettes fournies.',
  contact_email = 'bonjour@bodyclub.test', contact_phone = '01 23 45 67 89',
  instagram_url = 'https://instagram.com/thebodyclub'`);

// Photos du studio (images de démonstration)
const { readFileSync, readdirSync } = await import("node:fs");
const dir = new URL("./demo-images/", import.meta.url);
for (const [i, f] of readdirSync(dir).sort().entries()) {
  const path = `studio/demo-${f}`;
  await supabase.storage.from("site").upload(path, readFileSync(new URL(f, dir)), { contentType: "image/jpeg", upsert: true });
  const url = supabase.storage.from("site").getPublicUrl(path).data.publicUrl;
  await db.query("insert into public.site_photos (url, alt, sort_order) values ($1, $2, $3)", [url, `Le studio — photo ${i + 1}`, i]);
}

console.log("Données de démonstration créées.");
console.log("Admin : pao@bodyclub.test / bodyclub2026");
console.log("Professeure : camille@bodyclub.test / bodyclub2026");
console.log("Cliente : ines@client.test / bodyclub2026");
await db.end();
