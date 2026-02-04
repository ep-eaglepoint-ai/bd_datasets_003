import {
  createIntegrationHarness,
  type IntegrationHarness,
  type TestContext,
} from "./testUtils/harness";
import {
  getInventoryQty,
  orderItems,
  seedInventory,
  US_WEST_ADDRESS,
} from "./testUtils/fixtures";

describe("Payment + refund behaviors", () => {
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

  test("payment timeout releases inventory (simulated delayed non-success status)", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p_timeout", quantity: 1 }]);

    const stripeState = (global as any).__stripeMockState;
    stripeState.paymentIntents.create.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              id: "pi_timeout",
              object: "payment_intent",
              status: "processing",
              amount: 0,
              currency: "usd",
              metadata: {},
              created: Math.floor(Date.now() / 1000),
            }),
          200
        );
      });
    });

    const pending = ctx.http.post("/orders").send({
      userId: "u_timeout",
      items: orderItems([
        { productId: "p_timeout", quantity: 1, pricePerUnit: 1 },
      ]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_timeout_1",
    });
    const res = await pending;

    expect(res.status).toBe(402);
    expect(await getInventoryQty(ctx.txPool, "p_timeout")).toBe(1);
  });

  test("idempotency key prevents duplicate charges on retry (successful order)", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p_idem", quantity: 2 }]);
    const stripeState = (global as any).__stripeMockState;

    const payload = {
      userId: "u_idem",
      items: orderItems([
        { productId: "p_idem", quantity: 1, pricePerUnit: 2 },
      ]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_retry_1",
    };

    const r1 = await ctx.http.post("/orders").send(payload);
    expect(r1.status).toBe(201);

    const r2 = await ctx.http.post("/orders").send(payload);
    expect(r2.status).toBe(201);
    expect(r2.body.id).toBe(r1.body.id);

    expect(stripeState.paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  test("failed orders do not cache idempotency key (current behavior) and will re-attempt payment on retry", async () => {
    await seedInventory(ctx.txPool, [
      { productId: "p_fail_idem", quantity: 1 },
    ]);
    const stripeState = (global as any).__stripeMockState;

    stripeState.paymentIntents.create.mockImplementation(async () => ({
      id: "pi_fail_idem",
      object: "payment_intent",
      status: "requires_payment_method",
      amount: 0,
      currency: "usd",
      metadata: {},
      created: Math.floor(Date.now() / 1000),
    }));

    const payload = {
      userId: "u_fail_idem",
      items: orderItems([
        { productId: "p_fail_idem", quantity: 1, pricePerUnit: 2 },
      ]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_failed_retry_1",
    };

    const r1 = await ctx.http.post("/orders").send(payload);
    expect(r1.status).toBe(402);

    const r2 = await ctx.http.post("/orders").send(payload);
    expect(r2.status).toBe(402);

    // Current implementation caches idempotency only on success, so retries re-attempt payment.
    expect(stripeState.paymentIntents.create.mock.calls.length).toBe(2);
  });

  test("full refund restores complete inventory and sets order status to refunded", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p_ref", quantity: 5 }]);

    const orderRes = await ctx.http.post("/orders").send({
      userId: "u_ref_full",
      items: orderItems([
        { productId: "p_ref", quantity: 2, pricePerUnit: 10 },
      ]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_ref_full_1",
    });
    expect(orderRes.status).toBe(201);

    const stripeState = (global as any).__stripeMockState;
    stripeState.paymentIntents.search.mockImplementationOnce(async () => ({
      object: "search_result",
      data: [
        {
          id: "pi_for_refund",
          object: "payment_intent",
          status: "succeeded",
          amount: Math.round(orderRes.body.total * 100),
          currency: "usd",
          metadata: { orderId: orderRes.body.id },
          created: Math.floor(Date.now() / 1000),
        },
      ],
      has_more: false,
      url: "/v1/payment_intents/search",
    }));

    const refundRes = await ctx.http
      .post(`/orders/${orderRes.body.id}/refund`)
      .send({
        items: [{ productId: "p_ref", quantity: 2 }],
      });

    expect(refundRes.status).toBe(200);
    expect(refundRes.body.status).toBe("refunded");

    expect(await getInventoryQty(ctx.txPool, "p_ref")).toBe(5);

    // Refund record and amount
    const rr = await ctx.txPool.query(
      "SELECT * FROM refunds WHERE order_id = $1",
      [orderRes.body.id]
    );
    expect(rr.rows).toHaveLength(1);
    expect(parseFloat(rr.rows[0].amount)).toBe(20);

    expect(stripeState.refunds.create).toHaveBeenCalledWith({
      payment_intent: "pi_for_refund",
      amount: 2000,
    });
  });

  test("partial refund restores only refunded quantities and keeps order status paid", async () => {
    await seedInventory(ctx.txPool, [
      { productId: "p_ref_part", quantity: 10 },
    ]);

    const orderRes = await ctx.http.post("/orders").send({
      userId: "u_ref_part",
      items: orderItems([
        { productId: "p_ref_part", quantity: 4, pricePerUnit: 5 },
      ]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_ref_part_1",
    });
    expect(orderRes.status).toBe(201);

    const stripeState = (global as any).__stripeMockState;
    stripeState.paymentIntents.search.mockImplementationOnce(async () => ({
      object: "search_result",
      data: [
        {
          id: "pi_for_partial_refund",
          object: "payment_intent",
          status: "succeeded",
          amount: Math.round(orderRes.body.total * 100),
          currency: "usd",
          metadata: { orderId: orderRes.body.id },
          created: Math.floor(Date.now() / 1000),
        },
      ],
      has_more: false,
      url: "/v1/payment_intents/search",
    }));

    const refundRes = await ctx.http
      .post(`/orders/${orderRes.body.id}/refund`)
      .send({
        items: [{ productId: "p_ref_part", quantity: 1 }],
      });

    expect(refundRes.status).toBe(200);
    expect(refundRes.body.status).toBe("paid");

    // Inventory: started 10, order consumed 4 => 6, refund 1 => 7
    expect(await getInventoryQty(ctx.txPool, "p_ref_part")).toBe(7);

    const orderRow = await ctx.txPool.query(
      "SELECT status FROM orders WHERE id = $1",
      [orderRes.body.id]
    );
    expect(orderRow.rows[0].status).toBe("paid");

    const rr = await ctx.txPool.query(
      "SELECT * FROM refunds WHERE order_id = $1",
      [orderRes.body.id]
    );
    expect(rr.rows).toHaveLength(1);
    expect(parseFloat(rr.rows[0].amount)).toBe(5);
  });

  test("reject refunds for unpaid orders and refunds exceeding ordered quantity", async () => {
    await seedInventory(ctx.txPool, [{ productId: "p_unpaid", quantity: 1 }]);

    // Create an unpaid order row directly.
    const ins = await ctx.txPool.query(
      `INSERT INTO orders (user_id, items, subtotal, shipping_cost, total, status, shipping_address)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
      [
        "u_unpaid",
        JSON.stringify([
          { productId: "p_unpaid", quantity: 1, pricePerUnit: 3 },
        ]),
        3,
        1,
        4,
        JSON.stringify(US_WEST_ADDRESS),
      ]
    );

    const orderId = ins.rows[0].id;

    const r1 = await ctx.http.post(`/orders/${orderId}/refund`).send({
      items: [{ productId: "p_unpaid", quantity: 1 }],
    });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toContain("refunded");

    // Paid order for exceed test
    await seedInventory(ctx.txPool, [{ productId: "p_exceed", quantity: 3 }]);
    const orderRes = await ctx.http.post("/orders").send({
      userId: "u_exceed",
      items: orderItems([
        { productId: "p_exceed", quantity: 1, pricePerUnit: 10 },
      ]),
      shippingAddress: US_WEST_ADDRESS,
      idempotencyKey: "idem_exceed_1",
    });
    expect(orderRes.status).toBe(201);

    const stripeState = (global as any).__stripeMockState;
    stripeState.paymentIntents.search.mockImplementationOnce(async () => ({
      object: "search_result",
      data: [
        {
          id: "pi_exceed",
          object: "payment_intent",
          status: "succeeded",
          amount: Math.round(orderRes.body.total * 100),
          currency: "usd",
          metadata: { orderId: orderRes.body.id },
          created: Math.floor(Date.now() / 1000),
        },
      ],
      has_more: false,
      url: "/v1/payment_intents/search",
    }));

    const r2 = await ctx.http.post(`/orders/${orderRes.body.id}/refund`).send({
      items: [{ productId: "p_exceed", quantity: 2 }],
    });
    expect(r2.status).toBe(400);
    expect(r2.body.error).toContain("Cannot refund more than ordered quantity");
  });
});
