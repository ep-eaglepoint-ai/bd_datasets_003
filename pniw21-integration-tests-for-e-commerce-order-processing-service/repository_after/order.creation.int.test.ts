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

    // Req 4: for inventory errors no idempotency entry should be stored.
    expect(await getIdempotency(ctx.redis, "idem_oos_1")).toBeNull();

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

    // Req 4 / Req 8: payment failures must cache idempotency so retry returns same failed order.
    expect(await getIdempotency(ctx.redis, "idem_decline_1")).toBe(
      orders.rows[0].id
    );

    // Req 4: Stripe mock called with correct total amount (in cents).
    expect(stripeState.paymentIntents.create).toHaveBeenCalledTimes(1);
    const args = stripeState.paymentIntents.create.mock.calls[0][0];
    expect(args.amount).toBe(Math.round(parseFloat(orders.rows[0].total) * 100));

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

    const responses = fulfilled.map((r) => r.value);
    const statuses = responses.map((r) => r.status);
    const ok = responses.filter((r) => r.status === 201);
    const fail = responses.filter((r) => r.status !== 201);

    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(2);

    // Req 5: failures must be inventory errors, not random status codes.
    for (const r of fail) {
      expect(r.status).toBe(409);
      expect(r.body?.error ?? "").toContain("Insufficient inventory");
    }

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

  test("order with multiple items from different warehouses (modeled as distinct product IDs)", async () => {
    await seedInventory(ctx.txPool, [
      { productId: "wh1:pA", quantity: 3 },
      { productId: "wh2:pB", quantity: 2 },
    ]);

    const res = await ctx.http.post("/orders").send({
      userId: "u_wh_multi",
      items: orderItems([
        { productId: "wh1:pA", quantity: 1, pricePerUnit: 3.0 },
        { productId: "wh2:pB", quantity: 2, pricePerUnit: 2.5 },
      ]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_wh_multi_1",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("paid");

    // Req 4: idempotency stored + Stripe mock called with correct cents.
    expect(await getIdempotency(ctx.redis, "idem_wh_multi_1")).toBe(res.body.id);
    const stripeState = (global as any).__stripeMockState;
    expect(stripeState.paymentIntents.create).toHaveBeenCalledTimes(1);
    const args = stripeState.paymentIntents.create.mock.calls[0][0];
    expect(args.amount).toBe(Math.round(res.body.total * 100));

    expect(await getInventoryQty(ctx.txPool, "wh1:pA")).toBe(2);
    expect(await getInventoryQty(ctx.txPool, "wh2:pB")).toBe(0);
    expect(await getReservation(ctx.redis, "wh1:pA")).toBe(0);
    expect(await getReservation(ctx.redis, "wh2:pB")).toBe(0);
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

    // Req 4: idempotency stored + Stripe mock called with correct cents.
    expect(await getIdempotency(ctx.redis, "idem_multi_1")).toBe(res.body.id);
    const stripeState = (global as any).__stripeMockState;
    expect(stripeState.paymentIntents.create).toHaveBeenCalledTimes(1);
    const args = stripeState.paymentIntents.create.mock.calls[0][0];
    expect(args.amount).toBe(Math.round(res.body.total * 100));

    expect(await getInventoryQty(ctx.txPool, "pA")).toBe(3);
    expect(await getInventoryQty(ctx.txPool, "pB")).toBe(3);
    expect(await getReservation(ctx.redis, "pA")).toBe(0);
    expect(await getReservation(ctx.redis, "pB")).toBe(0);
  });
});
