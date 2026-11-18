import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// Formats renvoyés à l'application (et seulement à elle, pas à Better Auth) :
// horodatages en chaînes ISO, dates « AAAA-MM-JJ » brutes, montants et compteurs en nombres.
const appTypes = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    switch (oid) {
      case 1184: return (v: string) => new Date(v).toISOString(); // timestamptz
      case 1114: return (v: string) => new Date(`${v}Z`).toISOString(); // timestamp
      case 1082: return (v: string) => v; // date
      case 1700: return (v: string) => parseFloat(v); // numeric
      case 20: return (v: string) => Number(v); // bigint
      default: return types.getTypeParser(oid, format as "text");
    }
  },
};

/**
 * Accès à la base PostgreSQL (Neon en production).
 *
 * Toutes les requêtes passent par une transaction qui endosse un rôle :
 *   - asUser(id)  → rôle app_authenticated + identité de la cliente : la Row Level
 *                   Security et les fonctions métier s'appliquent exactement comme prévu ;
 *   - asAnon()    → rôle app_anon : uniquement les données publiques ;
 *   - asService() → rôle propriétaire : réservé au serveur (webhooks, SMS, tâches).
 */
const globalForDb = globalThis as unknown as { bodyclubPool?: Pool; bodyclubAuthPool?: Pool };

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Variable d'environnement manquante : DATABASE_URL");
  return url;
}

/** Connexions de l'application (formats ci-dessus). */
export function pool(): Pool {
  globalForDb.bodyclubPool ??= new Pool({ connectionString: connectionString(), max: 5, idleTimeoutMillis: 10_000, types: appTypes });
  return globalForDb.bodyclubPool;
}

/** Connexions de Better Auth (formats PostgreSQL standards : vraies dates). */
export function authPool(): Pool {
  globalForDb.bodyclubAuthPool ??= new Pool({ connectionString: connectionString(), max: 3, idleTimeoutMillis: 10_000 });
  return globalForDb.bodyclubAuthPool;
}

export type Tx = {
  /** Toutes les lignes. */
  many<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** La première ligne, ou null. */
  one<T extends QueryResultRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Nombre de lignes touchées. */
  run(sql: string, params?: unknown[]): Promise<number>;
  /** INSERT d'un objet { colonne: valeur } ; renvoie la ligne créée. */
  insert<T extends QueryResultRow = Record<string, unknown>>(table: string, values: Record<string, unknown>): Promise<T>;
  /** UPDATE … SET { colonne: valeur } WHERE id = $id ; renvoie le nombre de lignes modifiées (0 si la RLS l'interdit). */
  update(table: string, values: Record<string, unknown>, id: string | boolean): Promise<number>;
};

/** Identifiant SQL sûr : uniquement des noms écrits dans le code (lettres, chiffres, _ et un point de schéma). */
function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(name)) throw new Error(`Identifiant SQL invalide : ${name}`);
  return name.split(".").map((p) => `"${p}"`).join(".");
}

function wrap(client: PoolClient): Tx {
  return {
    async many(sql, params = []) { return (await client.query(sql, params)).rows; },
    async one(sql, params = []) { return (await client.query(sql, params)).rows[0] ?? null; },
    async run(sql, params = []) { return (await client.query(sql, params)).rowCount ?? 0; },
    async insert(table, values) {
      const cols = Object.keys(values);
      const sql = `insert into ${ident(table)} (${cols.map(ident).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning *`;
      return (await client.query(sql, cols.map((c) => values[c]))).rows[0];
    },
    async update(table, values, id) {
      const cols = Object.keys(values);
      const sql = `update ${ident(table)} set ${cols.map((c, i) => `${ident(c)} = $${i + 1}`).join(", ")} where id = $${cols.length + 1}`;
      return (await client.query(sql, [...cols.map((c) => values[c]), id])).rowCount ?? 0;
    },
  };
}

async function transaction<T>(setup: (c: PoolClient) => Promise<void>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await setup(client);
    const result = await fn(wrap(client));
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return transaction(async (c) => {
    await c.query("set local role app_authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId })]);
  }, fn);
}

export function asAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return transaction(async (c) => {
    await c.query("set local role app_anon");
  }, fn);
}

export function asService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return transaction(async () => {}, fn);
}

/** Lit l'utilisatrice ou un visiteur anonyme selon le cas. */
export function asViewer<T>(userId: string | null | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return userId ? asUser(userId, fn) : asAnon(fn);
}
