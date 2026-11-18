import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  asService, asUser, book, cancel, createSession, createTeacher, createUser, errorOf, getAdmin, grantPass, pass, pool,
} from "./helpers";

afterAll(() => pool.end());

async function productId(name: string): Promise<string> {
  const { rows } = await pool.query("select id from public.products where name = $1", [name]);
  return rows[0].id;
}

async function buy(userId: string, productName: string, opts: { subtotal?: number; discount?: number; total?: number } = {}) {
  const order = await asUser(userId, async (c) =>
    (await c.query("select * from public.create_pending_order($1)", [await productId(productName)])).rows[0]);
  const subtotal = opts.subtotal ?? order.amount_subtotal_cents;
  const r = await asService(async (c) =>
    (await c.query(
      "select public.process_checkout_completed($1, 'checkout.session.completed', $2, $3, $4, $5, $6, $7, null) as r",
      [`evt_${randomUUID()}`, order.id, `cs_${order.id}`, `pi_${order.id}`, subtotal, opts.discount ?? 0,
       opts.total ?? subtotal],
    )).rows[0].r);
  return { order, ...r };
}

async function adminBook(sessionId: string, userId: string) {
  return asUser(await getAdmin(), async (c) =>
    (await c.query("select * from public.admin_book_session($1, $2)", [sessionId, userId])).rows[0]);
}

async function payRule(teacherId: string, rule: Record<string, unknown>) {
  await pool.query(
    `insert into public.teacher_pay_rules (teacher_id, mode, percent, fixed_cents, per_attendee_cents, valid_from)
     values ($1, $2, $3, $4, $5, '2020-01-01')`,
    [teacherId, rule.mode, rule.percent ?? null, rule.fixed_cents ?? null, rule.per_attendee_cents ?? null],
  );
}

async function teacherPay(teacherId: string) {
  const { rows } = await pool.query("select current_date - 2 as f, current_date + 1 as t");
  return asUser(await getAdmin(), async (c) => {
    const r = await c.query("select * from public.admin_teacher_pay($1, $2) where teacher_id = $3",
      [rows[0].f, rows[0].t, teacherId]);
    return r.rows[0] ? { ...r.rows[0], amount: Number(r.rows[0].amount_cents), base: Number(r.rows[0].base_cents) } : null;
  });
}

describe("Carte offerte : le professeur est payé comme si elle avait été payée", () => {
  it("valeur réelle 0 €, valeur prof = prix public (carte 10 → 25 € par cours)", async () => {
    const u = await createUser();
    const admin = await getAdmin();
    const p = await asUser(admin, async (c) => (await c.query(
      `select (public.admin_grant_pass(p_user_id => $1, p_name => 'Carte 10 cours offerte', p_credits => 10,
         p_validity_value => 2, p_validity_unit => 'month', p_unit_value_cents => 0, p_product_id => $2,
         p_note => 'Cadeau')).*`, [u, await productId("Carte 10 cours")])).rows[0]);
    expect(Number(p.unit_value_cents)).toBe(0);
    expect(Number(p.pay_unit_value_cents)).toBe(2500);

    const teacher = await createTeacher();
    await payRule(teacher, { mode: "percent", percent: 40 });
    const s = await createSession({ startsInHours: -1, teacherId: teacher });
    const b = await adminBook(s, u);
    expect(Number(b.value_cents)).toBe(0);
    expect(Number(b.pay_value_cents)).toBe(2500);

    const pay = await teacherPay(teacher);
    // 25 € TTC → 20,83 € HT → 40 % = 8,33 €
    expect(pay.amount).toBeCloseTo(833.33, 1);
  });

  it("code promo : le professeur est payé sur le prix public, pas sur le prix remisé", async () => {
    const u = await createUser();
    const { pass_id } = await buy(u, "Carte 5 cours", { subtotal: 15000, discount: 3000, total: 12000 });
    const p = await pass(pass_id);
    expect(Number(p.unit_value_cents)).toBe(2400);
    expect(Number(p.pay_unit_value_cents)).toBe(3000);
  });
});

describe("Rémunération des professeurs", () => {
  it("40 % HT ; la professeure à 0 % (Pao) ne coûte rien ; annulation tardive comptée ; cours à venir exclu", async () => {
    const prof = await createTeacher();
    const pao = await createTeacher();
    await payRule(prof, { mode: "percent", percent: 40 });
    await payRule(pao, { mode: "none" });

    const done = await createSession({ startsInHours: -2, teacherId: prof });
    const future = await createSession({ startsInHours: 30, teacherId: prof });
    const paoClass = await createSession({ startsInHours: -3, teacherId: pao });

    for (let i = 0; i < 3; i++) {
      const u = await createUser();
      await grantPass(u, 5, { unitValueCents: 3000 }); // pay value = 3000 (pas de produit → valeur réelle)
      await adminBook(done, u);
      await adminBook(paoClass, u);
      await book(u, future);
    }
    // une annulation tardive : toujours rémunérée (réglage par défaut)
    const { rows: [late] } = await pool.query(
      "select id from public.bookings where session_id = $1 limit 1", [done]);
    await asUser(await getAdmin(), (c) => c.query("select public.admin_cancel_booking($1, false)", [late.id]));

    const p = await teacherPay(prof);
    expect(p.sessions).toBe(1);
    expect(p.attendees).toBe(3);
    expect(p.base).toBeCloseTo(7500, 1); // 3 × 30 € TTC = 90 € → 75 € HT
    expect(p.amount).toBeCloseTo(3000, 1); // 40 % de 75 € = 30 €

    const pPao = await teacherPay(pao);
    expect(pPao.amount).toBe(0);
  });

  it("montant fixe par cours et par participante", async () => {
    const fixed = await createTeacher();
    const perHead = await createTeacher();
    await payRule(fixed, { mode: "fixed_per_class", fixed_cents: 4000 });
    await payRule(perHead, { mode: "per_attendee", per_attendee_cents: 800 });
    const s1 = await createSession({ startsInHours: -1, teacherId: fixed });
    const s2 = await createSession({ startsInHours: -1, teacherId: perHead });
    for (let i = 0; i < 2; i++) {
      const u = await createUser();
      await grantPass(u, 2);
      await adminBook(s1, u);
      await adminBook(s2, u);
    }
    expect((await teacherPay(fixed)).amount).toBe(4000);
    expect((await teacherPay(perHead)).amount).toBe(1600);
  });

  it("le professeur voit sa rémunération, jamais celle des autres ni le CA", async () => {
    const profUser = await createUser("teacher");
    const prof = await createTeacher(profUser);
    await payRule(prof, { mode: "fixed_per_class", fixed_cents: 5000 });
    await createSession({ startsInHours: -1, teacherId: prof });
    const rows = await asUser(profUser, async (c) =>
      (await c.query("select * from public.my_teacher_pay(current_date - 1, current_date + 1)")).rows);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount_cents)).toBe(5000);
    expect(await errorOf(asUser(profUser, (c) => c.query("select public.admin_teacher_pay(current_date, current_date)"))))
      .toBe("FORBIDDEN");
    expect(await errorOf(asUser(profUser, (c) => c.query("select public.admin_dashboard()")))).toBe("FORBIDDEN");
  });
});

describe("Abonnement illimité (280 €)", () => {
  it("actif dès le paiement, aucun crédit débité, valeur d'un cours = 25 €", async () => {
    const u = await createUser();
    const pack = await grantPass(u, 5);
    const { pass_id } = await buy(u, "Illimité");
    const sub = await pass(pass_id);
    expect(sub.is_unlimited).toBe(true);
    expect(sub.activated_at).not.toBeNull();

    const b = await book(u, await createSession());
    expect(b.pass_id).toBe(pass_id);
    expect(b.credits_used).toBe(0);
    expect(Number(b.value_cents)).toBe(2500);
    expect((await pass(pack)).credits_remaining).toBe(5); // la carte n'est pas touchée
  });

  it("un cours après la fin de l'abonnement utilise une carte (ou est refusé)", async () => {
    const u = await createUser();
    await buy(u, "Illimité");
    await pool.query("update public.passes set expires_at = now() + interval '1 day' where user_id = $1 and is_unlimited", [u]);
    expect(await errorOf(book(u, await createSession({ startsInHours: 72 })))).toBe("NO_CREDITS");
  });

  it("pas plus de 2 annulations tardives d'affilée ; un cours suivi remet le compteur à zéro", async () => {
    const u = await createUser();
    await buy(u, "Illimité");

    // 1re et 2e annulations tardives : acceptées
    for (let i = 0; i < 2; i++) {
      const b = await book(u, await createSession({ startsInHours: 5 + i }));
      expect((await cancel(u, b.id)).status).toBe("late_cancelled");
    }
    // 3e d'affilée : refusée, la réservation reste active
    const third = await book(u, await createSession({ startsInHours: 8 }));
    expect(await errorOf(cancel(u, third.id))).toBe("LATE_CANCEL_LIMIT");

    // annuler dans le délai reste toujours possible
    const inTime = await book(u, await createSession({ startsInHours: 48 }));
    expect((await cancel(u, inTime.id)).status).toBe("cancelled");

    // l'admin peut passer outre
    const r = await asUser(await getAdmin(), async (c) =>
      (await c.query("select public.admin_cancel_booking($1) as r", [third.id])).rows[0].r);
    expect(r.status).toBe("late_cancelled");

    // un cours suivi plus récent remet le compteur à zéro
    const attended = await createSession({ startsInHours: 9 });
    const ab = await book(u, attended);
    await pool.query("update public.class_sessions set starts_at = now() + interval '9 hours' where id = $1", [attended]);
    await pool.query("update public.bookings set status = 'attended' where id = $1", [ab.id]);
    const again = await book(u, await createSession({ startsInHours: 10 }));
    expect((await cancel(u, again.id)).status).toBe("late_cancelled");
  });

  it("la règle ne s'applique pas aux cartes de cours", async () => {
    const u = await createUser();
    await grantPass(u, 5);
    for (let i = 0; i < 3; i++) {
      const b = await book(u, await createSession({ startsInHours: 5 + i }));
      expect((await cancel(u, b.id)).status).toBe("late_cancelled");
    }
  });
});

describe("Factures et avoirs", () => {
  it("une facture numérotée par paiement, montants HT / TVA / TTC", async () => {
    const u = await createUser("client", "Inès");
    const { order } = await buy(u, "Carte 3 cours");
    const { rows: [inv] } = await pool.query("select * from public.invoices where order_id = $1", [order.id]);
    expect(inv.number).toMatch(/^F\d{4}-\d{5}$/);
    expect(inv).toMatchObject({ kind: "invoice", total_ttc_cents: 9900, total_ht_cents: 8250, total_vat_cents: 1650 });
    expect(inv.buyer.name).toBe("Inès Cliente");
    expect(inv.lines[0]).toMatchObject({ label: "Carte 3 cours", unit_ttc_cents: 9900 });
  });

  it("numérotation continue même avec 10 paiements simultanés", async () => {
    const users = await Promise.all(Array.from({ length: 10 }, () => createUser()));
    const results = await Promise.all(users.map((u) => buy(u, "Carte 1 cours")));
    const { rows } = await pool.query(
      "select seq from public.invoices where order_id = any($1) order by seq", [results.map((r) => r.order.id)]);
    const seqs = rows.map((r) => r.seq);
    expect(new Set(seqs).size).toBe(10);
    expect(seqs[9] - seqs[0]).toBe(9); // aucun trou
  });

  it("un remboursement produit un avoir négatif lié à la facture", async () => {
    const u = await createUser();
    const { order } = await buy(u, "Carte 5 cours");
    await asService((c) => c.query("select public.process_refund($1, $2, 15000)", [order.id, `re_${randomUUID()}`]));
    const { rows } = await pool.query(
      "select kind, number, total_ttc_cents, related_invoice_id from public.invoices where order_id = $1 order by kind desc", [order.id]);
    expect(rows).toHaveLength(2);
    const [invoice, credit] = [rows.find((r) => r.kind === "invoice"), rows.find((r) => r.kind === "credit_note")];
    expect(credit.number).toMatch(/^A\d{4}-\d{5}$/);
    expect(credit.total_ttc_cents).toBe(-15000);
    expect(credit.related_invoice_id).not.toBeNull();
    expect(invoice.total_ttc_cents).toBe(15000);
  });

  it("une cliente ne voit que ses factures ; une facture ne peut pas être modifiée", async () => {
    const a = await createUser();
    const b = await createUser();
    await buy(a, "Carte 1 cours");
    const { order } = await buy(b, "Carte 1 cours");
    const seen = await asUser(a, async (c) => (await c.query("select user_id from public.invoices")).rows);
    expect(seen.every((r) => r.user_id === a)).toBe(true);
    expect(await errorOf(pool.query("update public.invoices set total_ttc_cents = 0 where order_id = $1", [order.id])))
      .toMatch(/LEDGER_IMMUTABLE/);
  });
});

describe("Planning (admin)", () => {
  it("crée un cours répété sur plusieurs semaines, à la bonne heure malgré le changement d'heure", async () => {
    const teacher = await createTeacher();
    const rows = await asUser(await getAdmin(), async (c) => (await c.query(
      "select * from public.admin_create_sessions('Lagree Sculpt', '2027-10-25', '09:00', 50, $1, 8, null, 2)",
      [teacher])).rows);
    expect(rows).toHaveLength(2);
    expect(rows[0].starts_at.toISOString()).toBe("2027-10-25T07:00:00.000Z"); // 9 h, heure d'été (UTC+2)
    expect(rows[1].starts_at.toISOString()).toBe("2027-11-01T08:00:00.000Z"); // 9 h, heure d'hiver (UTC+1) après le 31/10
    expect(rows[0].teacher_id).toBe(teacher);
    expect(rows[0].series_id).toBe(rows[1].series_id);

    const summer = await asUser(await getAdmin(), async (c) => (await c.query(
      "select * from public.admin_create_sessions('Lagree', '2027-06-14', '09:00', 50, null, 8)")).rows);
    expect(summer[0].starts_at.toISOString()).toBe("2027-06-14T07:00:00.000Z"); // 9 h, heure d'été (UTC+2)
  });

  it("copie une semaine sur les semaines suivantes, sans doublon", async () => {
    const admin = await getAdmin();
    await asUser(admin, (c) => c.query(
      "select public.admin_create_sessions('Copie test', '2028-03-06', '18:30', 50, null, 8)"));
    const n1 = await asUser(admin, async (c) =>
      (await c.query("select public.admin_copy_week('2028-03-06', '2028-03-13', 3) as n")).rows[0].n);
    const n2 = await asUser(admin, async (c) =>
      (await c.query("select public.admin_copy_week('2028-03-06', '2028-03-13', 3) as n")).rows[0].n);
    expect(n1).toBe(3);
    expect(n2).toBe(0);
  });

  it("modifier un cours : impossible de descendre sous le nombre d'inscrites ; une cliente ne peut rien créer", async () => {
    const s = await createSession({ capacity: 3 });
    for (let i = 0; i < 2; i++) {
      const u = await createUser();
      await grantPass(u, 1);
      await book(u, s);
    }
    expect(await errorOf(asUser(await getAdmin(), (c) => c.query(
      "select public.admin_update_session($1, 'Lagree', current_date + 2, '10:00', 50, null, 1)", [s]))))
      .toBe("CAPACITY_BELOW_BOOKINGS");
    const client = await createUser();
    expect(await errorOf(asUser(client, (c) => c.query(
      "select public.admin_create_sessions('X', current_date, '10:00', 50, null, 8)")))).toBe("FORBIDDEN");
  });
});

describe("Tableau de bord", () => {
  it("CA encaissé du jour, de la semaine et du mois ; meilleures clientes", async () => {
    const admin = await getAdmin();
    const before = await asUser(admin, async (c) => (await c.query("select public.admin_dashboard() as d")).rows[0].d);
    const u = await createUser("client", "Top");
    await buy(u, "Carte 10 cours");
    const after = await asUser(admin, async (c) => (await c.query("select public.admin_dashboard() as d")).rows[0].d);

    for (const k of ["today", "week", "month"]) {
      expect(after[k].gross_cents - before[k].gross_cents).toBe(25000);
    }
    expect(after.month.net_ht_cents).toBe(Math.round(after.month.net_ttc_cents / 1.2));

    const top = await asUser(admin, async (c) =>
      (await c.query("select * from public.admin_top_clients(current_date - 30, current_date, 500)")).rows);
    expect(top.find((t) => t.user_id === u)).toMatchObject({ paid_cents: "25000" });
  });
});

describe("Apparence du site", () => {
  it("lisible par tous, modifiable par l'admin uniquement, couleurs validées", async () => {
    const admin = await getAdmin();
    const client = await createUser();
    await asUser(null, async (c) => {
      expect((await c.query("select hero_title from public.site_appearance")).rows[0].hero_title).toBeTruthy();
    });
    const r = await asUser(client, (c) => c.query("update public.site_appearance set hero_title = 'Hack'"));
    expect(r.rowCount).toBe(0);
    expect(await errorOf(asUser(admin, (c) =>
      c.query("update public.site_appearance set color_accent = 'red;} body{display:none'")))).toMatch(/check constraint/);
    await asUser(admin, (c) => c.query("update public.site_appearance set color_accent = '#b08d7e'"));
    await asUser(admin, (c) => c.query("update public.site_appearance set color_accent = '#9c7f70'"));
  });
});

describe("Profils des coachs et pages publiques", () => {
  it("adresse de page lisible, unique, accents retirés", async () => {
    const { rows } = await pool.query(
      "insert into public.teachers (display_name) values ('Léa Été'), ('Léa Été') returning slug");
    expect(rows[0].slug).toMatch(/^lea-ete(-\d+)?$/);
    expect(rows[1].slug).not.toBe(rows[0].slug);
  });

  it("un visiteur voit le profil public, jamais le compte lié ni la rémunération", async () => {
    const t = await createTeacher(await createUser("teacher"));
    await pool.query("update public.teachers set headline = 'Coach certifiée', specialties = '{Sculpt,Core}' where id = $1", [t]);
    await asUser(null, async (c) => {
      const { rows } = await c.query("select display_name, headline, specialties, photo_url from public.teachers where id = $1", [t]);
      expect(rows[0]).toMatchObject({ headline: "Coach certifiée", specialties: ["Sculpt", "Core"] });
    });
    expect(await errorOf(asUser(null, (c) => c.query("select profile_id from public.teachers")))).toMatch(/permission denied/);
    expect(await errorOf(asUser(null, (c) => c.query("select * from public.teacher_pay_rules")))).toMatch(/permission denied/);
  });

  it("photos du studio : lisibles par tous, ajoutées par l'admin uniquement", async () => {
    const client = await createUser();
    expect(await errorOf(asUser(client, (c) =>
      c.query("insert into public.site_photos (url) values ('https://x.test/a.jpg')")))).toMatch(/row-level security/);
    await asUser(await getAdmin(), (c) => c.query("insert into public.site_photos (url, alt) values ('https://x.test/a.jpg', 'Salle')"));
    await asUser(null, async (c) => {
      expect((await c.query("select count(*)::int as n from public.site_photos")).rows[0].n).toBeGreaterThan(0);
    });
  });

  it("un lien Instagram doit être en https (pas de javascript:)", async () => {
    const t = await createTeacher();
    expect(await errorOf(pool.query("update public.teachers set instagram_url = 'javascript:alert(1)' where id = $1", [t])))
      .toMatch(/check constraint/);
  });
});

describe("Comptes, séance d'essai et notifications", () => {
  it("séance d'essai : une seule par cliente", async () => {
    const u = await createUser();
    await buy(u, "Séance d'essai");
    expect(await errorOf(asUser(u, async (c) =>
      c.query("select public.create_pending_order($1)", [await productId("Séance d'essai")])))).toBe("PRODUCT_LIMIT_REACHED");
    // les autres cartes restent achetables à volonté
    await buy(u, "Carte 1 cours");
    await buy(u, "Carte 1 cours");
  });

  it("le téléphone et le choix SMS donnés à l'inscription sont enregistrés", async () => {
    const { randomUUID: uuid } = await import("node:crypto");
    const id = uuid();
    await pool.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
      [id, `${id}@t.local`, { first_name: "Nina", phone: "+33612345678", sms_opt_in: false }]);
    const { rows: [p] } = await pool.query("select phone, sms_opt_in, must_change_password from public.profiles where id = $1", [id]);
    expect(p).toEqual({ phone: "+33612345678", sms_opt_in: false, must_change_password: false });
  });

  it("la cliente lève elle-même l'obligation de changer son mot de passe, sans pouvoir modifier ce champ directement", async () => {
    const u = await createUser();
    await pool.query("update public.profiles set must_change_password = true where id = $1", [u]);
    expect(await errorOf(asUser(u, (c) => c.query("update public.profiles set must_change_password = false where id = $1", [u]))))
      .toMatch(/permission denied/);
    await asUser(u, (c) => c.query("select public.clear_must_change_password()"));
    const { rows: [p] } = await pool.query("select must_change_password from public.profiles where id = $1", [u]);
    expect(p.must_change_password).toBe(false);
  });

  it("le journal des SMS n'est lisible que par l'admin", async () => {
    const u = await createUser();
    await pool.query("insert into public.notification_log (user_id, channel, kind, recipient, body, status) values ($1, 'sms', 'session_cancelled', '+33600000000', 'x', 'simulated')", [u]);
    expect((await asUser(u, (c) => c.query("select * from public.notification_log"))).rows).toEqual([]);
    expect((await asUser(await getAdmin(), (c) => c.query("select * from public.notification_log"))).rows.length).toBeGreaterThan(0);
  });
});

describe("Vente au studio", () => {
  it("crée commande payée, carte et facture « au studio », et compte dans le CA", async () => {
    const admin = await getAdmin();
    const u = await createUser();
    const before = await asUser(admin, async (c) => (await c.query("select public.admin_dashboard() as d")).rows[0].d);
    const r = await asUser(admin, async (c) => (await c.query(
      "select public.admin_sell_product($1, $2, 'cash') as r", [u, await productId("Carte 5 cours")])).rows[0].r);
    const p = await pass(r.pass_id);
    expect(p).toMatchObject({ credits_remaining: 5, activated_at: null });
    const { rows: [inv] } = await pool.query("select payment_method, total_ttc_cents from public.invoices where order_id = $1", [r.order_id]);
    expect(inv).toEqual({ payment_method: "Espèces", total_ttc_cents: 15000 });
    const after = await asUser(admin, async (c) => (await c.query("select public.admin_dashboard() as d")).rows[0].d);
    expect(after.today.gross_cents - before.today.gross_cents).toBe(15000);
  });

  it("réservée à l'admin", async () => {
    const u = await createUser();
    expect(await errorOf(asUser(u, async (c) => c.query("select public.admin_sell_product($1, $2)", [u, await productId("Carte 1 cours")]))))
      .toBe("FORBIDDEN");
  });
});
