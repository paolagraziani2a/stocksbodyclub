// Applique les migrations SQL (db/migrations) sur la base DATABASE_URL, une seule fois chacune.
//   node scripts/migrate.mjs          → migrations
//   node scripts/migrate.mjs --seed   → migrations + données de départ (cartes, cours) si la base est vide
// Lancé automatiquement à chaque déploiement Vercel (script « vercel-build »).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL absente : migrations ignorées.");
  process.exit(0);
}

const db = new pg.Client({ connectionString: url });
await db.connect();
await db.query("set client_min_messages = warning");
// Un seul déploiement à la fois applique les migrations
await db.query("select pg_advisory_lock(727274)");
try {
  await db.query(`create table if not exists public.schema_migrations (
    version text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await db.query("select version from public.schema_migrations")).rows.map((r) => r.version));
  const files = readdirSync(path.join(root, "db/migrations")).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (done.has(version)) continue;
    process.stdout.write(`→ ${file} … `);
    await db.query("begin");
    try {
      await db.query(readFileSync(path.join(root, "db/migrations", file), "utf8"));
      await db.query("insert into public.schema_migrations (version) values ($1)", [version]);
      await db.query("commit");
      console.log("ok");
    } catch (e) {
      await db.query("rollback");
      console.log("ÉCHEC");
      throw new Error(`${file} : ${e.message}`);
    }
  }
  await db.query("revoke all on public.schema_migrations from app_anon, app_authenticated");

  if (process.argv.includes("--seed")) {
    const { rows } = await db.query("select count(*)::int as n from public.products");
    if (rows[0].n === 0) {
      await db.query(readFileSync(path.join(root, "db/seed.sql"), "utf8"));
      console.log("→ données de départ (cartes, cours) : ok");
    } else {
      console.log("→ données de départ déjà présentes : rien à faire");
    }
  }
  console.log("Base à jour.");
} finally {
  await db.query("select pg_advisory_unlock(727274)");
  await db.end();
}
