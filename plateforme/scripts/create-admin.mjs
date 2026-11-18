// Crée le premier compte administrateur sur la base DATABASE_URL (ex. Neon en production).
// Usage : npm run admin:create -- prenom.nom@email.fr Prénom Nom
// Un mot de passe temporaire est affiché UNE fois : il faudra en choisir un nouveau à la première connexion.
import { randomInt } from "node:crypto";
import pg from "pg";
import { createAccount } from "./lib/users.mjs";

const [email, firstName = "", lastName = ""] = process.argv.slice(2);
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage : npm run admin:create -- email@exemple.fr Prénom Nom");
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL manquante."); process.exit(1); }

const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const temp = Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join("") + randomInt(10);

const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  await db.query("begin");
  const { rows } = await db.query("select p.id from public.profiles p where p.email = lower($1)", [email]);
  if (rows.length) {
    await db.query("update public.profiles set role = 'admin' where id = $1", [rows[0].id]);
    console.log(`Le compte ${email} existe déjà : il est maintenant administrateur.`);
  } else {
    await createAccount(db, { email, password: temp, firstName, lastName, role: "admin", mustChange: true });
    console.log(`Compte administrateur créé : ${email}`);
    console.log(`Mot de passe temporaire (affiché une seule fois) : ${temp}`);
    console.log("À la première connexion, vous choisirez votre propre mot de passe.");
  }
  await db.query("commit");
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
