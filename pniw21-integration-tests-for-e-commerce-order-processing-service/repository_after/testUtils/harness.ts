import type { Pool } from "pg";
import type Redis from "ioredis";
import request from "supertest";

import { InventoryService } from "@sut/InventoryService";
import { OrderService } from "@sut/OrderService";
import { PaymentService } from "@sut/PaymentService";
import { ShippingService } from "@sut/ShippingService";

import { applySchemaOnce, createBasePool } from "./db";
import {
  createTransactionalPool,
  type TransactionalPool,
} from "./transactionalPool";
import { createTestRedis, flushRedis } from "./redis";
import { createTestApp } from "./testApp";

export type TestContext = {
  txPool: TransactionalPool;
  redis: Redis;
  inventoryService: InventoryService;
  paymentService: PaymentService;
  shippingService: ShippingService;
  orderService: OrderService;
  http: ReturnType<typeof request>;
  cleanup: () => Promise<void>;
};

export type IntegrationHarness = {
  basePool: Pool;
  redis: Redis;
  createContext: () => Promise<TestContext>;
  close: () => Promise<void>;
};

export async function createIntegrationHarness(): Promise<IntegrationHarness> {
  const basePool = createBasePool();
  await applySchemaOnce(basePool);

  const redis = createTestRedis();

  const close = async () => {
    try {
      await redis.quit();
    } finally {
      // Ensure the socket is closed even if quit fails.
      redis.disconnect();
    }
    await basePool.end();
  };

  const createContext = async (): Promise<TestContext> => {
    // Ensure the Stripe mock module has initialized its shared state.
    // The state is created when StripeMock is constructed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const StripeCtor = require("stripe").default;
    // eslint-disable-next-line no-new
    new StripeCtor("sk_test_init", { apiVersion: "2023-10-16" });

    // Reset Stripe mock state per test so mockImplementationOnce doesn't leak.
    const stripeState = (global as any).__stripeMockState;
    if (stripeState?.paymentIntents?.create?.mockReset) {
      stripeState.paymentIntents.create
        .mockReset()
        .mockImplementation(async () => ({
          id: "pi_test_123",
          object: "payment_intent",
          status: "succeeded",
          amount: 0,
          currency: "usd",
          metadata: {},
          created: Math.floor(Date.now() / 1000),
        }));
    }
    if (stripeState?.paymentIntents?.search?.mockReset) {
      stripeState.paymentIntents.search
        .mockReset()
        .mockImplementation(async () => ({
          object: "search_result",
          data: [],
          has_more: false,
          url: "/v1/payment_intents/search",
        }));
    }
    if (stripeState?.refunds?.create?.mockReset) {
      stripeState.refunds.create
        .mockReset()
        .mockImplementation(async (params: any) => ({
          id: "re_test_123",
          object: "refund",
          status: "succeeded",
          amount: params.amount,
          currency: "usd",
          payment_intent: params.payment_intent,
          created: Math.floor(Date.now() / 1000),
        }));
    }
    if (stripeState?.webhooks?.constructEvent?.mockReset) {
      stripeState.webhooks.constructEvent
        .mockReset()
        .mockImplementation(
          (payload: any, signature: string, secret: string) => {
            if (signature !== "valid" || secret !== "whsec_test") {
              const err: any = new Error("Invalid signature");
              err.type = "StripeSignatureVerificationError";
              throw err;
            }
            const raw = Buffer.isBuffer(payload)
              ? payload.toString("utf8")
              : payload;
            return JSON.parse(raw);
          }
        );
    }

    // Requirement: each test starts with a clean Redis DB (dedicated DB 15).
    expect((redis as any)?.options?.db).toBe(15);
    await flushRedis(redis);
    const keys = await redis.keys("*");
    expect(keys).toHaveLength(0);
    const reservationKeys = await redis.keys("reservation:*");
    expect(reservationKeys).toHaveLength(0);

    const txPool = await createTransactionalPool(basePool);

    const inventoryService = new InventoryService(txPool, redis);
    const paymentService = new PaymentService("sk_test_do_not_use");

    // Explicit check (Req 3): ensure our Stripe mock surface is wired.
    expect(stripeState).toBeDefined();
    expect(stripeState?.paymentIntents?.create).toBeDefined();
    expect(stripeState?.paymentIntents?.search).toBeDefined();
    expect(stripeState?.refunds?.create).toBeDefined();
    expect(stripeState?.webhooks?.constructEvent).toBeDefined();

    const shippingService = new ShippingService();
    const orderService = new OrderService(
      txPool,
      redis,
      inventoryService,
      paymentService,
      shippingService
    );

    const app = createTestApp({
      pool: txPool,
      redis,
      orderService,
      webhookSecret: "whsec_test",
    });
    const http = request(app);

    const cleanup = async () => {
      // Make cleanup safe to call multiple times (e.g. on test timeouts).
      const stateKey = "__cleanupDone";
      const anyPool = txPool as any;
      if (anyPool[stateKey]) return;
      anyPool[stateKey] = true;
      try {
        await txPool.__tx.rollback();
      } finally {
        txPool.__tx.release();
        await flushRedis(redis);
      }
    };

    return {
      txPool,
      redis,
      inventoryService,
      paymentService,
      shippingService,
      orderService,
      http,
      cleanup,
    };
  };

  return { basePool, redis, createContext, close };
}
