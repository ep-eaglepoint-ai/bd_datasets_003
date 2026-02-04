import {
  createIntegrationHarness,
  type IntegrationHarness,
  type TestContext,
} from "./testUtils/harness";
import { ShippingService } from "@sut/ShippingService";

const US_WEST = {
  street: "1 Main St",
  city: "San Francisco",
  state: "CA",
  zipCode: "94105",
  country: "US",
};

const US_EAST = {
  street: "1 Main St",
  city: "New York",
  state: "NY",
  zipCode: "10001",
  country: "US",
};

const US_CENTRAL = {
  street: "1 Main St",
  city: "Chicago",
  state: "IL",
  zipCode: "60601",
  country: "US",
};

const INTERNATIONAL = {
  street: "1 Main St",
  city: "Toronto",
  state: "ON",
  zipCode: "M5V 2T6",
  country: "CA",
};

describe("Service coverage (fast)", () => {
  let harness!: IntegrationHarness;
  let ctx!: TestContext;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    ctx = await harness.createContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("ShippingService zones + address validation + delivery estimate", () => {
    const shipping = new ShippingService();

    // validateAddress
    expect(shipping.validateAddress(US_WEST)).toBe(true);
    expect(shipping.validateAddress({ ...US_WEST, street: "" })).toBe(false);
    expect(shipping.validateAddress({ ...US_WEST, city: "" })).toBe(false);
    expect(shipping.validateAddress({ ...US_WEST, state: "" })).toBe(false);
    expect(shipping.validateAddress({ ...US_WEST, zipCode: "" })).toBe(false);
    expect(shipping.validateAddress({ ...US_WEST, country: "" })).toBe(false);
    expect(shipping.validateAddress({ ...US_WEST, zipCode: "abc" })).toBe(
      false
    );

    // calculateShippingCost: ensure each zone path is exercised
    const items = [{ productId: "p", quantity: 3, pricePerUnit: 1 }];
    expect(shipping.calculateShippingCost(US_WEST, items)).toBeGreaterThan(0);
    expect(shipping.calculateShippingCost(US_EAST, items)).toBeGreaterThan(0);
    expect(shipping.calculateShippingCost(US_CENTRAL, items)).toBeGreaterThan(
      0
    );
    expect(
      shipping.calculateShippingCost(INTERNATIONAL, items)
    ).toBeGreaterThan(0);

    // estimateDeliveryDays
    expect(shipping.estimateDeliveryDays(US_WEST)).toBe(3);
    expect(shipping.estimateDeliveryDays(US_EAST)).toBe(5);
    expect(shipping.estimateDeliveryDays(US_CENTRAL)).toBe(4);
    expect(shipping.estimateDeliveryDays(INTERNATIONAL)).toBe(14);
  });

  test("InventoryService missing-product availability is 0; release without reservation increments DB quantity", async () => {
    expect(
      await ctx.inventoryService.getAvailableQuantity("does_not_exist")
    ).toBe(0);

    await ctx.inventoryService.setQuantity("p_inc", 1);
    expect(await ctx.inventoryService.getAvailableQuantity("p_inc")).toBe(1);

    // No reservation exists -> release() should increment inventory row quantity.
    await ctx.inventoryService.release("p_inc", 2);
    expect(await ctx.inventoryService.getAvailableQuantity("p_inc")).toBe(3);
  });

  test("OrderService cancel rejects non-cancellable state; refund rejects missing product", async () => {
    const ins = await ctx.txPool.query(
      `INSERT INTO orders (user_id, items, subtotal, shipping_cost, total, status, shipping_address)
       VALUES ($1, $2, $3, $4, $5, 'cancelled', $6) RETURNING id`,
      ["u_cov", JSON.stringify([]), 0, 0, 0, JSON.stringify(US_WEST)]
    );

    await expect(ctx.orderService.cancelOrder(ins.rows[0].id)).rejects.toThrow(
      "Order cannot be cancelled"
    );

    // Insert a paid order with a known item, then attempt refund for missing product.
    const paid = await ctx.txPool.query(
      `INSERT INTO orders (user_id, items, subtotal, shipping_cost, total, status, shipping_address)
       VALUES ($1, $2, $3, $4, $5, 'paid', $6) RETURNING id`,
      [
        "u_cov2",
        JSON.stringify([
          { productId: "p_in_order", quantity: 1, pricePerUnit: 1 },
        ]),
        1,
        0,
        1,
        JSON.stringify(US_WEST),
      ]
    );

    const stripeState = (global as any).__stripeMockState;
    stripeState.paymentIntents.search.mockImplementationOnce(async () => ({
      object: "search_result",
      data: [{ id: "pi_for_refund" }],
      has_more: false,
      url: "/v1/payment_intents/search",
    }));

    await expect(
      ctx.orderService.processRefund(paid.rows[0].id, [
        { productId: "not_in_order", quantity: 1 },
      ])
    ).rejects.toThrow("not in order");
  });
});
