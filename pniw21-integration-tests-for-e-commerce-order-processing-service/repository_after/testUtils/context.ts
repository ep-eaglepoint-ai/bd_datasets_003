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
  basePool: Pool;
  txPool: TransactionalPool;
  redis: Redis;
  inventoryService: InventoryService;
  paymentService: PaymentService;
  shippingService: ShippingService;
  orderService: OrderService;
  app: ReturnType<typeof createTestApp>;
  http: ReturnType<typeof request>;
  cleanup: () => Promise<void>;
};

export async function createTestContext(): Promise<TestContext> {
  const basePool = createBasePool();
  await applySchemaOnce(basePool);

  const redis = createTestRedis();
  await flushRedis(redis);

  const txPool = await createTransactionalPool(basePool);

  const inventoryService = new InventoryService(txPool, redis);
  const paymentService = new PaymentService("sk_test_do_not_use");
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
    await txPool.__tx.rollback();
    txPool.__tx.release();
    await flushRedis(redis);
    await redis.quit();
    await basePool.end();
  };

  return {
    basePool,
    txPool,
    redis,
    inventoryService,
    paymentService,
    shippingService,
    orderService,
    app,
    http,
    cleanup,
  };
}
