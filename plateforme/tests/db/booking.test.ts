import { afterAll, describe, expect, it } from "vitest";
import {
  asUser, book, cancel, createSession, createUser, errorOf, grantPass, ledger, pass, pool, session,
} from "./helpers";

afterAll(() => pool.end());

describe("Réservation", () => {
  it("débite un crédit, historise le mouvement et occupe une place", async () => {
    const u = await createUser();
    const p = await grantPass(u, 5);
    const s = await createSession();

    const b = await book(u, s);

    expect(b.status).toBe("booked");
    expect(b.pass_id).toBe(p);
    expect((await pass(p)).credits_remaining).toBe(4);
    expect((await session(s)).booked_count).toBe(1);
    const l = await ledger(p);
    expect(l.map((r) => [r.reason, r.delta])).toEqual([["admin_grant", 5], ["booking", -1]]);
    expect(l[1].booking_id).toBe(b.id);
  });

  it("refuse sans crédit", async () => {
    const u = await createUser();
    const s = await createSession();
    expect(await errorOf(book(u, s))).toBe("NO_CREDITS");
    expect((await session(s)).booked_count).toBe(0);
  });

  it("active la carte à la première réservation (validité calculée à partir de ce jour)", async () => {
    const u = await createUser();
    const p = await grantPass(u, 3, { validityMonths: 1 });
    expect((await pass(p)).activated_at).toBeNull();

    await book(u, await createSession());
    const after = await pass(p);
    expect(after.activated_at).not.toBeNull();
    const { rows } = await pool.query(
      "select public.compute_expiry($1, 1, 'month') as e", [after.activated_at],
    );
    expect(after.expires_at.toISOString()).toBe(rows[0].e.toISOString());
  });

  it("expire le lendemain de la date anniversaire à minuit, heure de Paris", async () => {
    const { rows } = await pool.query(`
      select public.compute_expiry('2026-11-18 10:00+01', 1, 'month') as a,
             public.compute_expiry('2026-03-20 23:30+01', 2, 'month') as b,
             public.compute_expiry('2026-01-31 12:00+01', 1, 'month') as c`);
    expect(rows[0].a.toISOString()).toBe("2026-12-18T23:00:00.000Z"); // 19/12 00:00 Paris
    expect(rows[0].b.toISOString()).toBe("2026-05-20T22:00:00.000Z"); // 21/05 00:00 Paris (heure d'été)
    expect(rows[0].c.toISOString()).toBe("2026-02-28T23:00:00.000Z"); // fin de mois courte
  });

  it("utilise d'abord la carte active qui expire le plus tôt, avant une carte neuve", async () => {
    const u = await createUser();
    const neuve = await grantPass(u, 10);
    const tard = await grantPass(u, 5, { activatedAt: new Date(), expiresAt: new Date(Date.now() + 40 * 864e5) });
    const tot = await grantPass(u, 5, { activatedAt: new Date(), expiresAt: new Date(Date.now() + 10 * 864e5) });

    const b = await book(u, await createSession());
    expect(b.pass_id).toBe(tot);
    expect((await pass(tard)).credits_remaining).toBe(5);
    expect((await pass(neuve)).activated_at).toBeNull();
  });

  it("n'utilise jamais une carte expirée ni une carte révoquée", async () => {
    const u = await createUser();
    await grantPass(u, 5, { activatedAt: new Date(Date.now() - 40 * 864e5), expiresAt: new Date(Date.now() - 864e5) });
    const revoked = await grantPass(u, 5);
    await pool.query("update public.passes set revoked_at = now() where id = $1", [revoked]);
    expect(await errorOf(book(u, await createSession()))).toBe("NO_CREDITS");
  });

  it("une carte peut servir pour un cours qui a lieu après sa date d'expiration", async () => {
    const u = await createUser();
    const p = await grantPass(u, 3, { activatedAt: new Date(), expiresAt: new Date(Date.now() + 864e5) });
    const b = await book(u, await createSession({ startsInHours: 24 * 5 }));
    expect(b.pass_id).toBe(p);
  });

  it("gère plusieurs cartes : passe à la suivante quand la première est vide", async () => {
    const u = await createUser();
    const p1 = await grantPass(u, 1);
    const p2 = await grantPass(u, 3);
    const b1 = await book(u, await createSession());
    const b2 = await book(u, await createSession());
    expect(b1.pass_id).toBe(p1);
    expect(b2.pass_id).toBe(p2);
    expect((await pass(p2)).credits_remaining).toBe(2);
  });

  it("empêche de réserver deux fois le même cours", async () => {
    const u = await createUser();
    await grantPass(u, 5);
    const s = await createSession();
    await book(u, s);
    expect(await errorOf(book(u, s))).toBe("ALREADY_BOOKED");
  });

  it("refuse au-delà de la capacité", async () => {
    const s = await createSession({ capacity: 2 });
    for (let i = 0; i < 2; i++) {
      const u = await createUser();
      await grantPass(u, 1);
      await book(u, s);
    }
    const late = await createUser();
    const p = await grantPass(late, 1);
    expect(await errorOf(book(late, s))).toBe("SESSION_FULL");
    expect((await pass(p)).credits_remaining).toBe(1);
  });

  it("refuse un cours annulé, commencé ou trop lointain", async () => {
    const u = await createUser();
    await grantPass(u, 5);
    const cancelled = await createSession();
    await pool.query("update public.class_sessions set status = 'cancelled' where id = $1", [cancelled]);
    expect(await errorOf(book(u, cancelled))).toBe("SESSION_CANCELLED");
    expect(await errorOf(book(u, await createSession({ startsInHours: -0.5 })))).toBe("SESSION_STARTED");
    expect(await errorOf(book(u, await createSession({ startsInHours: 24 * 40 })))).toBe("BOOKING_NOT_OPEN");
  });

  it("concurrence : 12 clientes pour la dernière place → une seule réussit", async () => {
    const s = await createSession({ capacity: 1 });
    const users = await Promise.all(Array.from({ length: 12 }, () => createUser()));
    await Promise.all(users.map((u) => grantPass(u, 1)));

    const results = await Promise.allSettled(users.map((u) => book(u, s)));

    const ok = results.filter((r) => r.status === "fulfilled");
    const ko = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(ko.every((r) => r.reason.message === "SESSION_FULL")).toBe(true);
    expect((await session(s)).booked_count).toBe(1);
  });

  it("concurrence : 1 seul crédit, 5 cours réservés en même temps → une seule réservation", async () => {
    const u = await createUser();
    const p = await grantPass(u, 1);
    const sessions = await Promise.all(Array.from({ length: 5 }, () => createSession()));

    const results = await Promise.allSettled(sessions.map((s) => book(u, s)));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await pass(p)).credits_remaining).toBe(0);
  });

  it("concurrence : double clic sur le même cours → une seule réservation", async () => {
    const u = await createUser();
    const p = await grantPass(u, 5);
    const s = await createSession();
    const results = await Promise.allSettled([book(u, s), book(u, s), book(u, s)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await pass(p)).credits_remaining).toBe(4);
  });

  it("l'admin peut réserver pour une cliente, une cliente ne peut pas réserver pour une autre", async () => {
    const u = await createUser();
    const other = await createUser();
    await grantPass(u, 2);
    const s = await createSession();
    expect(await errorOf(asUser(other, (c) => c.query("select public.admin_book_session($1, $2)", [s, u]))))
      .toBe("FORBIDDEN");
    const { getAdmin } = await import("./helpers");
    const b = await asUser(await getAdmin(), async (c) =>
      (await c.query("select * from public.admin_book_session($1, $2)", [s, u])).rows[0]);
    expect(b.user_id).toBe(u);
  });
});

describe("Annulation", () => {
  it("dans le délai (> 12 h) : crédit rendu sur la même carte, la carte reste activée", async () => {
    const u = await createUser();
    const p = await grantPass(u, 3);
    const s = await createSession({ startsInHours: 48 });
    const b = await book(u, s);

    const r = await cancel(u, b.id);

    expect(r).toMatchObject({ status: "cancelled", credit_refunded: true, in_time: true });
    const after = await pass(p);
    expect(after.credits_remaining).toBe(3);
    expect(after.activated_at).not.toBeNull(); // réponse studio : la carte reste activée
    expect((await session(s)).booked_count).toBe(0);
    expect((await ledger(p)).map((l) => l.reason)).toEqual(["admin_grant", "booking", "cancel_refund"]);
  });

  it("tardive (< 12 h) : crédit perdu, mais la place est libérée", async () => {
    const u = await createUser();
    const p = await grantPass(u, 3);
    const s = await createSession({ startsInHours: 5 });
    const b = await book(u, s);

    const r = await cancel(u, b.id);

    expect(r).toMatchObject({ status: "late_cancelled", credit_refunded: false });
    expect((await pass(p)).credits_remaining).toBe(2);
    expect((await session(s)).booked_count).toBe(0);
  });

  it("limite exacte : 12 h 05 avant = remboursé ; 11 h 55 avant = tardif", async () => {
    const u = await createUser();
    await grantPass(u, 5);
    const b1 = await book(u, await createSession({ startsInHours: 12 + 5 / 60 }));
    const b2 = await book(u, await createSession({ startsInHours: 12 - 5 / 60 }));
    expect((await cancel(u, b1.id)).credit_refunded).toBe(true);
    expect((await cancel(u, b2.id)).credit_refunded).toBe(false);
  });

  it("on peut réserver à nouveau après une annulation", async () => {
    const u = await createUser();
    await grantPass(u, 2);
    const s = await createSession();
    const b = await book(u, s);
    await cancel(u, b.id);
    const again = await book(u, s);
    expect(again.status).toBe("booked");
  });

  it("une cliente ne peut pas annuler la réservation d'une autre", async () => {
    const u = await createUser();
    const intruder = await createUser();
    await grantPass(u, 1);
    const b = await book(u, await createSession());
    expect(await errorOf(cancel(intruder, b.id))).toBe("FORBIDDEN");
  });

  it("on n'annule pas deux fois", async () => {
    const u = await createUser();
    const p = await grantPass(u, 2);
    const b = await book(u, await createSession());
    await cancel(u, b.id);
    expect(await errorOf(cancel(u, b.id))).toBe("BOOKING_NOT_ACTIVE");
    expect((await pass(p)).credits_remaining).toBe(2);
  });

  it("l'admin peut rendre le crédit d'une annulation tardive (geste commercial)", async () => {
    const { getAdmin } = await import("./helpers");
    const u = await createUser();
    const p = await grantPass(u, 2);
    const b = await book(u, await createSession({ startsInHours: 2 }));
    const r = await asUser(await getAdmin(), async (c) =>
      (await c.query("select public.admin_cancel_booking($1, true) as r", [b.id])).rows[0].r);
    expect(r.credit_refunded).toBe(true);
    expect((await pass(p)).credits_remaining).toBe(2);
  });

  it("annulation d'un cours par le studio : toutes les inscrites sont recréditées", async () => {
    const { getAdmin } = await import("./helpers");
    const s = await createSession({ startsInHours: 3 });
    const passes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const u = await createUser();
      passes.push(await grantPass(u, 2));
      await book(u, s);
    }
    const r = await asUser(await getAdmin(), async (c) =>
      (await c.query("select public.admin_cancel_session($1, 'Professeure malade') as r", [s])).rows[0].r);
    expect(r.refunded_bookings).toBe(3);
    for (const p of passes) expect((await pass(p)).credits_remaining).toBe(2);
    const after = await session(s);
    expect(after.status).toBe("cancelled");
    expect(after.booked_count).toBe(0);
  });
});
