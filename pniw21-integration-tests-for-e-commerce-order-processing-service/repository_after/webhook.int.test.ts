import {
  createIntegrationHarness,
  type IntegrationHarness,
  type TestContext,
} from "./testUtils/harness";
import { US_WEST_ADDRESS } from "./testUtils/fixtures";

function buildEvent(params: {
  id: string;
  type: string;
  created: number;
  orderId: string;
}) {
  return {
    id: params.id,
    object: "event",
    type: params.type,
    created: params.created,
    data: {
      object: {
        id: "pi_any",
        object: "payment_intent",
        metadata: {
          orderId: params.orderId,
        },
      },
    },
  };
}

describe("Stripe webhook handling", () => {
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

  test("valid Stripe webhook signature accepted", async () => {
    const ins = await ctx.txPool.query(
      `INSERT INTO orders (user_id, items, subtotal, shipping_cost, total, status, shipping_address)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
      ["u_wh", JSON.stringify([]), 0, 0, 0, JSON.stringify(US_WEST_ADDRESS)]
    );
    const orderId = ins.rows[0].id;

    const payload = JSON.stringify(
      buildEvent({
        id: "evt_valid_1",
        type: "payment_intent.succeeded",
        created: 1000,
        orderId,
      })
    );

    const res = await ctx.http
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send(payload);

    expect(res.status).toBe(200);

    const row = await ctx.txPool.query(
      "SELECT status FROM orders WHERE id = $1",
      [orderId]
    );
    expect(row.rows[0].status).toBe("paid");
  });

  test("invalid signature rejected with 401", async () => {
    const res = await ctx.http
      .post("/webhooks/stripe")
      .set("stripe-signature", "nope")
      .set("content-type", "application/json")
      .send(
        JSON.stringify({
          id: "evt_bad",
          type: "payment_intent.succeeded",
          created: 1,
          data: { object: {} },
        })
      );

    expect(res.status).toBe(401);
  });

  test("webhook idempotency: same event processed once", async () => {
    const ins = await ctx.txPool.query(
      `INSERT INTO orders (user_id, items, subtotal, shipping_cost, total, status, shipping_address)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
      ["u_wh2", JSON.stringify([]), 0, 0, 0, JSON.stringify(US_WEST_ADDRESS)]
    );
    const orderId = ins.rows[0].id;

    const payload = JSON.stringify(
      buildEvent({
        id: "evt_dupe_1",
        type: "payment_intent.succeeded",
        created: 2000,
        orderId,
      })
    );

    const r1 = await ctx.http
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send(payload);
    expect(r1.status).toBe(200);

    const r2 = await ctx.http
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send(payload);
    expect(r2.status).toBe(200);
    expect(r2.body.duplicate).toBe(true);

    const wasStored = await ctx.redis.get("stripe:event:evt_dupe_1");
    expect(wasStored).toBe("1");

    const row = await ctx.txPool.query(
      "SELECT status FROM orders WHERE id = $1",
      [orderId]
    );
    expect(row.rows[0].status).toBe("paid");
  });

  test("out-of-order webhook events handled by event.created timestamp", async () => {
    const ins = await ctx.txPool.query(
      `INSERT INTO orders (user_id, items, subtotal, shipping_cost, total, status, shipping_address)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
      ["u_wh3", JSON.stringify([]), 0, 0, 0, JSON.stringify(US_WEST_ADDRESS)]
    );
    const orderId = ins.rows[0].id;

    // Newer event first sets payment_failed
    const failedNewer = JSON.stringify(
      buildEvent({
        id: "evt_newer_fail",
        type: "payment_intent.payment_failed",
        created: 3000,
        orderId,
      })
    );

    const olderSuccess = JSON.stringify(
      buildEvent({
        id: "evt_older_success",
        type: "payment_intent.succeeded",
        created: 2500,
        orderId,
      })
    );

    const r1 = await ctx.http
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send(failedNewer);
    expect(r1.status).toBe(200);

    const r2 = await ctx.http
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send(olderSuccess);
    expect(r2.status).toBe(200);
    expect(r2.body.ignored).toBe(true);

    const row = await ctx.txPool.query(
      "SELECT status FROM orders WHERE id = $1",
      [orderId]
    );
    expect(row.rows[0].status).toBe("payment_failed");
  });
});
