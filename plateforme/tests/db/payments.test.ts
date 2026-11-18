import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asService, asUser, book, createSession, createUser, errorOf, ledger, pool } from "./helpers";

afterAll(() => pool.end());

async function productId(credits: number): Promise<string> {
  const { rows } = await pool.query("select id from public.products where credits = $1 and max_per_client is null", [credits]);
  return rows[0].id;
}

async function pendingOrder(userId: string, credits: number) {
  return asUser(userId, async (c) =>
    (await c.query("select * from public.create_pending_order($1)", [await productId(credits)])).rows[0]);
}

async function completed(orderId: string, opts: { eventId?: string; total?: number; subtotal?: number; discount?: number } = {}) {
  const cs = `cs_test_${orderId}`;
  return asService(async (c) =>
    (await c.query(
      "select public.process_checkout_completed($1, 'checkout.session.completed', $2, $3, $4, $5, $6, $7, $8) as r",
      [opts.eventId ?? `evt_${randomUUID()}`, orderId, cs, `pi_${orderId}`, opts.subtotal ?? 9900,
       opts.discount ?? 0, opts.total ?? 9900, opts.discount ? "BIENVENUE10" : null],
    )).rows[0].r);
}

async function refund(orderId: string, amount: number, refundId = `re_${randomUUID()}`, credits: number | null = null) {
  return asService(async (c) =>
    (await c.query("select public.process_refund($1, $2, $3, $4) as r", [orderId, refundId, amount, credits])).rows[0].r);
}

describe("Achat de cartes (webhook Stripe)", () => {
  it("la commande « pending » reprend le prix et la validité du produit", async () => {
    const u = await createUser();
    const o = await pendingOrder(u, 10);
    expect(o).toMatchObject({ status: "pending", credits: 10, amount_subtotal_cents: 25000, validity_value: 2, validity_unit: "month" });
  });

  it("paiement confirmé → carte créée, non activée, valeur du crédit = prix / crédits", async () => {
    const u = await createUser();
    const o = await pendingOrder(u, 3);
    const r = await completed(o.id);
    expect(r.status).toBe("credited");

    const { rows: [p] } = await pool.query("select * from public.passes where id = $1", [r.pass_id]);
    expect(p).toMatchObject({ user_id: u, source: "stripe", credits_total: 3, credits_remaining: 3, activated_at: null });
    expect(Number(p.unit_value_cents)).toBe(3300);
    expect((await ledger(p.id)).map((l) => [l.reason, l.delta])).toEqual([["purchase", 3]]);
    const { rows: [order] } = await pool.query("select * from public.orders where id = $1", [o.id]);
    expect(order.status).toBe("paid");
  });

  it("idempotence : le même événement reçu deux fois ne crédite qu'une fois", async () => {
    const u = await createUser();
    const o = await pendingOrder(u, 5);
    const evt = `evt_${randomUUID()}`;
    await completed(o.id, { eventId: evt, total: 15000, subtotal: 15000 });
    const again = await completed(o.id, { eventId: evt, total: 15000, subtotal: 15000 });
    expect(again.status).toBe("duplicate_event");
    const { rows } = await pool.query("select count(*)::int as n from public.passes where order_id = $1", [o.id]);
    expect(rows[0].n).toBe(1);
  });

  it("idempotence : deux événements différents pour la même commande ne créditent qu'une fois", async () => {
    const u = await createUser();
    const o = await pendingOrder(u, 5);
    await completed(o.id, { total: 15000, subtotal: 15000 });
    const second = await completed(o.id, { total: 15000, subtotal: 15000 });
    expect(second.status).toBe("already_paid");
  });

  it("concurrence : 5 livraisons simultanées du même événement → une seule carte", async () => {
    const u = await createUser();
    const o = await pendingOrder(u, 10);
    const evt = `evt_${randomUUID()}`;
    await Promise.allSettled(Array.from({ length: 5 }, () => completed(o.id, { eventId: evt, total: 25000, subtotal: 25000 })));
    const { rows } = await pool.query(
      "select count(*)::int as n, sum(credits_remaining)::int as c from public.passes where order_id = $1", [o.id]);
    expect(rows[0]).toEqual({ n: 1, c: 10 });
  });

  it("code promo : la valeur du crédit tient compte de la remise", async () => {
    const u = await createUser();
    const o = await pendingOrder(u, 3);
    const r = await completed(o.id, { subtotal: 9900, discount: 990, total: 8910 });
    const { rows: [p] } = await pool.query("select unit_value_cents from public.passes where id = $1", [r.pass_id]);
    expect(Number(p.unit_value_cents)).toBe(2970);
    const { rows: [order] } = await pool.query("select * from public.orders where id = $1", [o.id]);
    expect(order).toMatchObject({ amount_discount_cents: 990, amount_total_cents: 8910, promotion_code: "BIENVENUE10" });
  });

  it("une cliente ne peut pas déclencher le crédit d'une commande elle-même", async () => {
    const u = await createUser();
    const o = await pendingOrder(u, 3);
    const err = await errorOf(asUser(u, (c) => c.query(
      "select public.process_checkout_completed('evt_x', 'checkout.session.completed', $1, 'cs', 'pi', 0, 0, 0)", [o.id])));
    expect(err).toMatch(/permission denied/);
  });

  it("produit désactivé : impossible de créer une commande", async () => {
    const u = await createUser();
    const { rows: [p] } = await pool.query(
      "insert into public.products (name, credits, price_cents, validity_value, active) values ('Ancienne', 1, 100, 1, false) returning id");
    expect(await errorOf(asUser(u, (c) => c.query("select public.create_pending_order($1)", [p.id]))))
      .toBe("PRODUCT_NOT_AVAILABLE");
  });
});

describe("Remboursements", () => {
  it("total : retire les crédits restants et révoque la carte", async () => {
    const u = await createUser();
    const o = await pendingOrder(u, 5);
    const { pass_id } = await completed(o.id, { total: 15000, subtotal: 15000 });
    await book(u, await createSession()); // 1 crédit consommé

    const r = await refund(o.id, 15000);

    expect(r).toMatchObject({ full: true, credits_removed: 4 });
    const { rows: [p] } = await pool.query("select * from public.passes where id = $1", [pass_id]);
    expect(p.credits_remaining).toBe(0);
    expect(p.revoked_at).not.toBeNull();
    const { rows: [order] } = await pool.query("select * from public.orders where id = $1", [o.id]);
    expect(order).toMatchObject({ status: "refunded", amount_refunded_cents: 15000 });
  });

  it("partiel : aucun crédit retiré sauf demande explicite", async () => {
    const u = await createUser();
    const o = await pendingOrder(u, 10);
    const { pass_id } = await completed(o.id, { total: 25000, subtotal: 25000 });
    expect((await refund(o.id, 5000)).credits_removed).toBe(0);
    expect((await refund(o.id, 5000, undefined, 2)).credits_removed).toBe(2);
    const { rows: [p] } = await pool.query("select credits_remaining, revoked_at from public.passes where id = $1", [pass_id]);
    expect(p).toEqual({ credits_remaining: 8, revoked_at: null });
  });

  it("idempotent par identifiant de remboursement Stripe, et jamais plus que le montant payé", async () => {
    const u = await createUser();
    const o = await pendingOrder(u, 1);
    await completed(o.id, { total: 3500, subtotal: 3500 });
    await refund(o.id, 1000, "re_same");
    expect((await refund(o.id, 1000, "re_same")).status).toBe("duplicate_refund");
    expect(await errorOf(refund(o.id, 3000))).toBe("REFUND_EXCEEDS_PAYMENT");
  });
});
