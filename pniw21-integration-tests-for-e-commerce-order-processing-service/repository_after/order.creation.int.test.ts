import {
  createIntegrationHarness,
  type IntegrationHarness,
  type TestContext,
} from "./testUtils/harness";
import {
  getIdempotency,
  getInventoryQty,
  getOrderRow,
  getReservation,
  orderItems,
  seedInventory,
  US_WEST_ADDRESS,
} from "./testUtils/fixtures";

describe("Order creation flow", () => {
  let harness!: IntegrationHarness;
  let ctx!: TestContext;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  beforeEach(async () => {
    ctx = await harness.createContext();
  });

  afterEach(async () => {
    if (ctx) await ctx.cleanup();
  });

  test("successful order with valid items and payment", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p1", quantity: 10 }]);

    const idempotencyKey = "idem_success_1";
    const items = orderItems([
      { productId: "p1", quantity: 2, pricePerUnit: 12.5 },
    ]);

    const res = await ctx.http.post("/orders").send({
      userId: "u1",
      items,
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey,
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("paid");
    expect(res.body.total).toBeGreaterThan(0);

    const row = await getOrderRow(ctx.txPool, res.body.id);
    expect(row).not.toBeNull();
    expect(row.status).toBe("paid");

    // Inventory permanently decreased after payment confirmation
    expect(await getInventoryQty(ctx.txPool, "p1")).toBe(8);
    // Reservation cleared
    expect(await getReservation(ctx.redis, "p1")).toBe(0);

    // Idempotency stored
    expect(await getIdempotency(ctx.redis, idempotencyKey)).toBe(res.body.id);

    // Stripe mock called with correct cents
    const stripeState = (global as any).__stripeMockState;
    expect(stripeState.paymentIntents.create).toHaveBeenCalledTimes(1);
    const args = stripeState.paymentIntents.create.mock.calls[0][0];
    expect(args.amount).toBe(Math.round(res.body.total * 100));
    expect(args.metadata.orderId).toBe(res.body.id);
    expect(args.metadata.customerId).toBe("u1");
  });

  test("order fails when item out of stock", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p_out", quantity: 1 }]);

    const res = await ctx.http.post("/orders").send({
      userId: "u2",
      items: orderItems([
        { productId: "p_out", quantity: 2, pricePerUnit: 10 },
      ]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_oos_1",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Insufficient inventory");

    // No reservation should be left behind
    expect(await getReservation(ctx.redis, "p_out")).toBe(0);
    // Inventory unchanged
    expect(await getInventoryQty(ctx.txPool, "p_out")).toBe(1);

    const stripeState = (global as any).__stripeMockState;
    expect(stripeState.paymentIntents.create).not.toHaveBeenCalled();
  });

  test("order fails when payment declined and inventory is released", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p2", quantity: 3 }]);

    const stripeState = (global as any).__stripeMockState;
    stripeState.paymentIntents.create.mockImplementationOnce(async () => ({
      id: "pi_declined",
      object: "payment_intent",
      status: "requires_payment_method",
      amount: 0,
      currency: "usd",
      metadata: {},
      created: Math.floor(Date.now() / 1000),
    }));

    const res = await ctx.http.post("/orders").send({
      userId: "u3",
      items: orderItems([{ productId: "p2", quantity: 2, pricePerUnit: 9.99 }]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_decline_1",
    });

    expect(res.status).toBe(402);

    // The order exists in DB and ends in payment_failed
    const orders = await ctx.txPool.query(
      "SELECT * FROM orders WHERE user_id = $1",
      ["u3"]
    );
    expect(orders.rows.length).toBe(1);
    expect(orders.rows[0].status).toBe("payment_failed");

    // Inventory restored (confirmReservation not called)
    expect(await getInventoryQty(ctx.txPool, "p2")).toBe(3);
    expect(await getReservation(ctx.redis, "p2")).toBe(0);
  });

  test("concurrent orders for limited inventory: only one succeeds", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p_last", quantity: 1 }]);

    const makeReq = (k: string) =>
      ctx.http.post("/orders").send({
        userId: `u_conc_${k}`,
        items: orderItems([
          { productId: "p_last", quantity: 1, pricePerUnit: 5 },
        ]),
        shippingAddress: US_WEST_ADDRESS,
        idempotencyKey: `idem_conc_${k}`,
      });

    const results = await Promise.allSettled([
      makeReq("a"),
      makeReq("b"),
      makeReq("c"),
    ]);

    const fulfilled = results.filter(
      (r) => r.status === "fulfilled"
    ) as PromiseFulfilledResult<any>[];
    expect(fulfilled).toHaveLength(3);

    const statuses = fulfilled.map((r) => r.value.status);
    const ok = statuses.filter((s) => s === 201);
    const fail = statuses.filter((s) => s !== 201);

    expect(ok).toHaveLength(1);
    expect(fail.length).toBe(2);

    const inv = await getInventoryQty(ctx.txPool, "p_last");
    expect(inv).toBe(0);

    // Exactly one paid order, others should be inventory errors or payment errors depending on race
    const paidCount = (
      await ctx.txPool.query(
        "SELECT COUNT(*)::int AS c FROM orders WHERE status = 'paid'"
      )
    ).rows[0].c;
    expect(paidCount).toBe(1);

    // Reservation key should be cleared after successful confirmation
    expect(await getReservation(ctx.redis, "p_last")).toBe(0);
  });

  test("order with multiple items reserves/consumes inventory for each product", async () => {
    await seedInventory(ctx.txPool, [
      { productId: "pA", quantity: 5 },
      { productId: "pB", quantity: 4 },
    ]);

    const res = await ctx.http.post("/orders").send({
      userId: "u_multi",
      items: orderItems([
        { productId: "pA", quantity: 2, pricePerUnit: 3.0 },
        { productId: "pB", quantity: 1, pricePerUnit: 7.5 },
      ]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_multi_1",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("paid");

    expect(await getInventoryQty(ctx.txPool, "pA")).toBe(3);
    expect(await getInventoryQty(ctx.txPool, "pB")).toBe(3);
    expect(await getReservation(ctx.redis, "pA")).toBe(0);
    expect(await getReservation(ctx.redis, "pB")).toBe(0);
  });
});
