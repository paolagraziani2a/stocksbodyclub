import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

const url =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/bodyclub_test";

/** Connexion « superutilisateur » : uniquement pour préparer les données de test. */
export const pool = new Pool({ connectionString: url, max: 30 });

type Role = "client" | "teacher" | "admin";

/** Exécute fn dans une transaction en tant qu'utilisatrice connectée (RLS active). */
export async function asUser<T>(userId: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${userId ? "app_authenticated" : "app_anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role: "app_authenticated" } : { role: "app_anon" }),
    ]);
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

/** Exécute fn en tant que serveur (app_service : webhooks, tâches planifiées). */
export async function asService<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role app_service");
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

/** Renvoie le message d'erreur (code métier) d'une promesse qui doit échouer. */
export async function errorOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("La promesse devait échouer mais a réussi");
}

export async function createUser(role: Role = "client", firstName = "Test"): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, `${id}@test.local`, { first_name: firstName, last_name: "Cliente", terms_accepted: "true" }],
  );
  if (role !== "client") await pool.query("update public.profiles set role = $2 where id = $1", [id, role]);
  return id;
}

let adminId: string | null = null;
export async function getAdmin(): Promise<string> {
  adminId ??= await createUser("admin", "Admin");
  return adminId;
}

export async function createTeacher(profileId?: string): Promise<string> {
  const { rows } = await pool.query(
    "insert into public.teachers (display_name, profile_id) values ($1, $2) returning id",
    ["Prof Test", profileId ?? null],
  );
  return rows[0].id;
}

export async function createSession(
  opts: { startsInHours?: number; capacity?: number; teacherId?: string; creditCost?: number } = {},
): Promise<string> {
  const h = opts.startsInHours ?? 48;
  const { rows } = await pool.query(
    `insert into public.class_sessions (title, starts_at, ends_at, capacity, teacher_id, credit_cost)
     values ('Lagree', now() + make_interval(mins => ($1::numeric * 60)::int),
             now() + make_interval(mins => ($1::numeric * 60)::int + 50), $2, $3, $4)
     returning id`,
    [h, opts.capacity ?? 8, opts.teacherId ?? null, opts.creditCost ?? 1],
  );
  return rows[0].id;
}

/** Donne une carte via la fonction admin (comme en production), écritures historisées. */
export async function grantPass(
  userId: string,
  credits: number,
  opts: { validityMonths?: number; unitValueCents?: number; activatedAt?: Date; expiresAt?: Date } = {},
): Promise<string> {
  const admin = await getAdmin();
  return asUser(admin, async (c) => {
    const { rows } = await c.query(
      `select (public.admin_grant_pass(
         p_user_id => $1, p_name => $2, p_credits => $3, p_validity_value => $4,
         p_validity_unit => 'month', p_unit_value_cents => $5,
         p_activated_at => $6, p_expires_at => $7)).id`,
      [userId, `Carte ${credits}`, credits, opts.validityMonths ?? 1, opts.unitValueCents ?? 3000,
       opts.activatedAt ?? null, opts.expiresAt ?? null],
    );
    return rows[0].id as string;
  });
}

export async function book(userId: string, sessionId: string) {
  return asUser(userId, async (c) => (await c.query("select * from public.book_session($1)", [sessionId])).rows[0]);
}

export async function cancel(userId: string, bookingId: string) {
  return asUser(userId, async (c) => (await c.query("select public.cancel_booking($1) as r", [bookingId])).rows[0].r);
}

export async function pass(passId: string) {
  return (await pool.query("select * from public.passes where id = $1", [passId])).rows[0];
}

export async function session(sessionId: string) {
  return (await pool.query("select * from public.class_sessions where id = $1", [sessionId])).rows[0];
}

export async function ledger(passId: string) {
  return (await pool.query("select * from public.credit_ledger where pass_id = $1 order by id", [passId])).rows;
}
