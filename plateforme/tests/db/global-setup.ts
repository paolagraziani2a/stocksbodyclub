import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * Crée une base de test neuve et y applique : shim Supabase → migrations → seed.
 * Base par défaut : postgres://postgres:postgres@localhost:5432 (surcharge : TEST_DATABASE_ADMIN_URL).
 */
export const TEST_DB = "bodyclub_test";
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

export default async function setup() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${TEST_DB}`;
  process.env.TEST_DATABASE_URL = url.toString();

  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  await db.query("set client_min_messages = error");
  const root = path.resolve(__dirname, "../../supabase");
  const migrations = readdirSync(path.join(root, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(root, "migrations", f));
  for (const file of [path.join(root, "tests/supabase_shim.sql"), ...migrations, path.join(root, "seed.sql")]) {
    try {
      await db.query(readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`Échec en appliquant ${path.basename(file)} : ${(e as Error).message}`);
    }
  }
  await db.end();
}
