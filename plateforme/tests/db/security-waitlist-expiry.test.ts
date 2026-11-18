import { afterAll, describe, expect, it } from "vitest";
import {
  asService, asUser, book, cancel, createSession, createTeacher, createUser, errorOf, getAdmin, grantPass,
  ledger, pass, pool,
} from "./helpers";

afterAll(() => pool.end());

describe("Sécurité (RLS et droits)", () => {
  it("une cliente ne voit que ses propres réservations, cartes et crédits", async () => {
    const a = await createUser();
    const b = await createUser();
    await grantPass(a, 2);
    await grantPass(b, 2);
    await book(b, await createSession());

    const seen = await asUser(a, async (c) => ({
      bookings: (await c.query("select user_id from public.bookings")).rows,
      passes: (await c.query("select user_id from public.passes")).rows,
      ledger: (await c.query("select user_id from public.credit_ledger")).rows,
      profiles: (await c.query("select id from public.profiles")).rows,
    }));
    expect(seen.bookings).toEqual([]);
    expect(seen.passes.every((r) => r.user_id === a)).toBe(true);
    expect(seen.ledger.every((r) => r.user_id === a)).toBe(true);
    expect(seen.profiles).toEqual([{ id: a }]);
  });

  it("un visiteur non connecté voit le planning et les tarifs, rien d'autre", async () => {
    await createSession();
    await asUser(null, async (c) => {
      expect((await c.query("select count(*)::int as n from public.class_sessions")).rows[0].n).toBeGreaterThan(0);
      expect((await c.query("select count(*)::int as n from public.products")).rows[0].n).toBe(6);
    });
    expect(await errorOf(asUser(null, (c) => c.query("select * from public.bookings")))).toMatch(/permission denied/);
    expect(await errorOf(asUser(null, (c) => c.query("select public.book_session(gen_random_uuid())")))).toMatch(/permission denied/);
  });

  it("une cliente ne peut ni changer son rôle, ni modifier le planning, ni ses crédits", async () => {
    const u = await createUser();
    const p = await grantPass(u, 1);
    const s = await createSession();
    expect(await errorOf(asUser(u, (c) => c.query("update public.profiles set role = 'admin' where id = $1", [u]))))
      .toMatch(/permission denied/);
    expect(await errorOf(asUser(u, (c) => c.query("update public.passes set credits_remaining = 99 where id = $1", [p]))))
      .toMatch(/permission denied/);
    expect(await errorOf(asUser(u, (c) => c.query("update public.class_sessions set booked_count = 0 where id = $1", [s]))))
      .toMatch(/permission denied/);
    // Mise à jour autorisée mais filtrée par la RLS : 0 ligne touchée
    const r = await asUser(u, (c) => c.query("update public.class_sessions set title = 'Hack' where id = $1", [s]));
    expect(r.rowCount).toBe(0);
    expect(await errorOf(asUser(u, (c) => c.query("select public.admin_adjust_pass($1, 10, 'x')", [p])))).toBe("FORBIDDEN");
    expect(await errorOf(asUser(u, (c) => c.query("select public.admin_set_role($1, 'admin')", [u])))).toBe("FORBIDDEN");
  });

  it("une cliente peut modifier son nom et son téléphone", async () => {
    const u = await createUser();
    await asUser(u, (c) => c.query("update public.profiles set first_name = 'Léa', phone = '0600000000' where id = $1", [u]));
    const { rows: [p] } = await pool.query("select first_name, phone from public.profiles where id = $1", [u]);
    expect(p).toEqual({ first_name: "Léa", phone: "0600000000" });
  });

  it("le professeur voit la liste de SES cours, aucune donnée financière", async () => {
    const teacherUser = await createUser("teacher");
    const teacher = await createTeacher(teacherUser);
    const mine = await createSession({ teacherId: teacher });
    const other = await createSession({ teacherId: await createTeacher() });
    const client = await createUser("client", "Camille");
    await grantPass(client, 2);
    await book(client, mine);
    await book(client, other);

    const roster = await asUser(teacherUser, async (c) =>
      (await c.query("select * from public.session_roster($1)", [mine])).rows);
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ first_name: "Camille", last_initial: "C" });
    expect(await errorOf(asUser(teacherUser, (c) => c.query("select * from public.session_roster($1)", [other]))))
      .toBe("FORBIDDEN");

    await asUser(teacherUser, async (c) => {
      expect((await c.query("select * from public.orders")).rows).toEqual([]);
      expect((await c.query("select * from public.passes")).rows).toEqual([]);
      expect((await c.query("select * from public.teacher_pay_rules")).rows).toEqual([]);
      expect((await c.query("select * from public.bookings")).rows).toEqual([]);
    });
  });

  it("présences : le professeur pointe ses cours (à partir d'1 h avant), pas ceux des autres", async () => {
    const teacherUser = await createUser("teacher");
    const teacher = await createTeacher(teacherUser);
    const now = await createSession({ teacherId: teacher, startsInHours: 0.5 });
    const later = await createSession({ teacherId: teacher, startsInHours: 30 });
    const client = await createUser();
    await grantPass(client, 2);
    const b1 = await asUser(await getAdmin(), async (c) =>
      (await c.query("select * from public.admin_book_session($1, $2)", [now, client])).rows[0]);
    const b2 = await book(client, later);

    const r = await asUser(teacherUser, async (c) =>
      (await c.query("select * from public.set_attendance($1, 'attended')", [b1.id])).rows[0]);
    expect(r.status).toBe("attended");
    expect(await errorOf(asUser(teacherUser, (c) => c.query("select public.set_attendance($1, 'no_show')", [b2.id]))))
      .toBe("TOO_EARLY");
    expect(await errorOf(asUser(client, (c) => c.query("select public.set_attendance($1, 'attended')", [b1.id]))))
      .toBe("FORBIDDEN");
  });

  it("l'historique des crédits est impossible à modifier, même pour le serveur", async () => {
    const u = await createUser();
    const p = await grantPass(u, 1);
    expect(await errorOf(pool.query("update public.credit_ledger set delta = 50 where pass_id = $1", [p])))
      .toMatch(/LEDGER_IMMUTABLE/);
    expect(await errorOf(pool.query("delete from public.credit_ledger where pass_id = $1", [p])))
      .toMatch(/LEDGER_IMMUTABLE/);
  });

  it("la modification d'un produit est tracée dans le journal d'audit", async () => {
    const admin = await getAdmin();
    const { rows: [prod] } = await pool.query("select id from public.products where credits = 1 and max_per_client is null");
    await asUser(admin, (c) => c.query("update public.products set description = 'Essai' where id = $1", [prod.id]));
    const { rows } = await pool.query(
      "select actor_id, action from public.audit_log where entity = 'products' and entity_id = $1 order by id desc limit 1",
      [prod.id]);
    expect(rows[0]).toEqual({ actor_id: admin, action: "update" });
    await asUser(admin, (c) => c.query("update public.products set description = 'Un cours de Lagree.' where id = $1", [prod.id]));
  });
});

describe("Liste d'attente (notification simple)", () => {
  it("inscription possible seulement si le cours est complet ; une place libérée prévient la liste", async () => {
    const s = await createSession({ capacity: 1 });
    const first = await createUser();
    await grantPass(first, 1);
    const w = await createUser();
    await grantPass(w, 1);

    expect(await errorOf(asUser(w, (c) => c.query("select public.join_waitlist($1)", [s])))).toBe("SESSION_NOT_FULL");
    const b = await book(first, s);
    await asUser(w, (c) => c.query("select public.join_waitlist($1)", [s]));
    expect(await errorOf(asUser(w, (c) => c.query("select public.join_waitlist($1)", [s])))).toBe("ALREADY_ON_WAITLIST");

    // tant que le cours est complet, personne n'est prévenu
    let notify = await asService(async (c) => (await c.query("select * from public.claim_waitlist_notifications($1)", [s])).rows);
    expect(notify).toEqual([]);

    const r = await cancel(first, b.id);
    expect(r.waitlist_waiting).toBe(1);
    notify = await asService(async (c) => (await c.query("select * from public.claim_waitlist_notifications($1)", [s])).rows);
    expect(notify.map((n) => n.user_id)).toEqual([w]);

    // la première qui réserve obtient la place ; son inscription en liste d'attente est clôturée
    await book(w, s);
    const { rows } = await pool.query("select status from public.waitlist_entries where session_id = $1 and user_id = $2", [s, w]);
    expect(rows[0].status).toBe("booked");
  });
});

describe("Expiration des cartes (tâche quotidienne)", () => {
  it("retire les crédits expirés une seule fois, historisé", async () => {
    const u = await createUser();
    const expired = await grantPass(u, 5, {
      activatedAt: new Date(Date.now() - 40 * 864e5), expiresAt: new Date(Date.now() - 1000),
    });
    const valid = await grantPass(u, 3);

    const n1 = await asService(async (c) => (await c.query("select public.expire_passes() as n")).rows[0].n);
    const n2 = await asService(async (c) => (await c.query("select public.expire_passes() as n")).rows[0].n);

    expect(n1).toBeGreaterThanOrEqual(1);
    expect(n2).toBe(0);
    expect((await pass(expired)).credits_remaining).toBe(0);
    expect((await pass(valid)).credits_remaining).toBe(3);
    expect((await ledger(expired)).map((l) => [l.reason, l.delta])).toEqual([["admin_grant", 5], ["expiry", -5]]);
  });

  it("l'admin peut prolonger une carte (avec motif), tracé dans le journal", async () => {
    const admin = await getAdmin();
    const u = await createUser();
    const p = await grantPass(u, 3);
    const until = new Date(Date.now() + 90 * 864e5);
    expect(await errorOf(asUser(admin, (c) => c.query("select public.admin_set_pass_expiry($1, $2, '')", [p, until]))))
      .toBe("NOTE_REQUIRED");
    await asUser(admin, (c) => c.query("select public.admin_set_pass_expiry($1, $2, 'Blessure')", [p, until]));
    expect((await pass(p)).expires_at.getTime()).toBe(until.getTime());
  });
});

describe("Invariant comptable", () => {
  it("pour chaque carte, la somme de l'historique = crédits restants", async () => {
    const { rows } = await pool.query(`
      select p.id, p.credits_remaining, coalesce(sum(l.delta), 0)::int as ledger_sum
      from public.passes p left join public.credit_ledger l on l.pass_id = p.id
      group by p.id having p.credits_remaining <> coalesce(sum(l.delta), 0)`);
    expect(rows).toEqual([]);
  });
});
