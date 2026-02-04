import {
  createIntegrationHarness,
  type IntegrationHarness,
  type TestContext,
} from "./testUtils/harness";
import {
  getInventoryQty,
  getReservation,
  orderItems,
  seedInventory,
  US_WEST_ADDRESS,
} from "./testUtils/fixtures";

describe("Inventory lifecycle", () => {
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
    jest.useRealTimers();
  });

  test("inventory reserved during in-flight payment, then confirmed and reservation cleared", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p3", quantity: 2 }]);

    const stripeState = (global as any).__stripeMockState;
    stripeState.paymentIntents.create.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              id: "pi_delayed",
              object: "payment_intent",
              status: "succeeded",
              amount: 0,
              currency: "usd",
              metadata: {},
              created: Math.floor(Date.now() / 1000),
            }),
          250
        );
      });
    });

    const req = ctx.http.post("/orders").send({
      userId: "u_inflight",
      items: orderItems([{ productId: "p3", quantity: 1, pricePerUnit: 1 }]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_inflight_1",
    });

    const pending = new Promise<any>((resolve, reject) => {
      req.end((err, res) => (err ? reject(err) : resolve(res)));
    });

    // Wait until reservation is visible (Redis is real).
    let reserved = 0;
    for (let i = 0; i < 30; i += 1) {
      reserved = await getReservation(ctx.redis, "p3");
      if (reserved === 1) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(reserved).toBe(1);
    expect(await getInventoryQty(ctx.txPool, "p3")).toBe(2);

    const res = await pending;

    expect(res.status).toBe(201);
    expect(await getInventoryQty(ctx.txPool, "p3")).toBe(1);
    expect(await getReservation(ctx.redis, "p3")).toBe(0);
  });

  test("inventory released on payment failure", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p4", quantity: 2 }]);

    const stripeState = (global as any).__stripeMockState;
    stripeState.paymentIntents.create.mockImplementationOnce(async () => ({
      id: "pi_fail",
      object: "payment_intent",
      status: "requires_payment_method",
      amount: 0,
      currency: "usd",
      metadata: {},
      created: Math.floor(Date.now() / 1000),
    }));

    const res = await ctx.http.post("/orders").send({
      userId: "u_fail",
      items: orderItems([{ productId: "p4", quantity: 2, pricePerUnit: 2 }]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_fail_1",
    });

    expect(res.status).toBe(402);
    expect(await getInventoryQty(ctx.txPool, "p4")).toBe(2);
    expect(await getReservation(ctx.redis, "p4")).toBe(0);
  });

  test("inventory released on order cancellation", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p5", quantity: 5 }]);

    const res = await ctx.http.post("/orders").send({
      userId: "u_cancel",
      items: orderItems([{ productId: "p5", quantity: 3, pricePerUnit: 1 }]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_cancel_1",
    });
    expect(res.status).toBe(201);

    expect(await getInventoryQty(ctx.txPool, "p5")).toBe(2);

    // cancel triggers refund + release
    const cancel = await ctx.http
      .post(`/orders/${res.body.id}/cancel`)
      .send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("cancelled");

    expect(await getInventoryQty(ctx.txPool, "p5")).toBe(5);
  });

  test("reservation TTL is set to ~15 minutes (900s) and can be inspected via redis.ttl()", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p_ttl", quantity: 2 }]);

    const ok = await ctx.inventoryService.reserve("p_ttl", 1);
    expect(ok).toBe(true);

    const ttl = await ctx.redis.ttl("reservation:p_ttl");
    expect(ttl).toBeGreaterThanOrEqual(880);
    expect(ttl).toBeLessThanOrEqual(900);

    // Note: Jest fake timers do not advance Redis TTL (server-side).
  });

  test("reservation key with short TTL expires (real wait; Redis TTL is server-side)", async () => {
    jest.useRealTimers();
    await ctx.redis.setex("reservation:p_short_ttl", 2, "1");
    expect(await getReservation(ctx.redis, "p_short_ttl")).toBe(1);

    await new Promise((r) => setTimeout(r, 2200));

    expect(await getReservation(ctx.redis, "p_short_ttl")).toBe(0);
    const ttl = await ctx.redis.ttl("reservation:p_short_ttl");
    expect(ttl).toBeLessThanOrEqual(0);
  });

  test("concurrent reservation requests are serialized with redis lock", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p_lock", quantity: 1 }]);

    const r1 = ctx.inventoryService.reserve("p_lock", 1);
    const r2 = ctx.inventoryService.reserve("p_lock", 1);

    const results = await Promise.all([r1, r2]);
    const trueCount = results.filter(Boolean).length;
    expect(trueCount).toBe(1);

    expect(await getReservation(ctx.redis, "p_lock")).toBe(1);
  });

  test("partial reservation release for multi-item order when one item cannot be reserved", async () => {
    await seedInventory(ctx.txPool, [
      { productId: "p_ok", quantity: 1 },
      { productId: "p_no", quantity: 0 },
    ]);

    const res = await ctx.http.post("/orders").send({
      userId: "u_partial_release",
      items: orderItems([
        { productId: "p_ok", quantity: 1, pricePerUnit: 1 },
        { productId: "p_no", quantity: 1, pricePerUnit: 1 },
      ]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_partial_release_1",
    });

    expect(res.status).toBe(409);
    expect(await getReservation(ctx.redis, "p_ok")).toBe(0);
    expect(await getReservation(ctx.redis, "p_no")).toBe(0);
    expect(await getInventoryQty(ctx.txPool, "p_ok")).toBe(1);
  });
});
