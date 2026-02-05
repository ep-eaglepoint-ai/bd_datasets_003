/* eslint-disable @typescript-eslint/no-var-requires */

// Ensure deterministic timestamps/parsing where relevant.
process.env.TZ = "UTC";

// Guardrail: tests must not rely on process.env.STRIPE_SECRET_KEY.
let stripeSecretKeyAccessCount = 0;
try {
  Object.defineProperty(process.env, "STRIPE_SECRET_KEY", {
    configurable: true,
    get() {
      stripeSecretKeyAccessCount += 1;
      throw new Error(
        "process.env.STRIPE_SECRET_KEY must not be accessed in tests"
      );
    },
  });
} catch {
  // If the environment disallows redefining, we still enforce by convention.
}

(global as any).__stripeSecretKeyAccessCount = () => stripeSecretKeyAccessCount;

beforeEach(() => {
  // Explicit check (Req 3): Stripe SDK must be mocked.
  // If this fails, tests may attempt real Stripe usage.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const stripeModule = require("stripe");
  expect(stripeModule?.default?.name).toBe("StripeMock");
});

afterEach(() => {
  // Hard requirement: the test suite must never read STRIPE_SECRET_KEY.
  expect((global as any).__stripeSecretKeyAccessCount()).toBe(0);
});

jest.mock("stripe", () => {
  class StripeMock {
    public paymentIntents: any;
    public refunds: any;
    public webhooks: any;

    constructor(_secretKey: string, _opts: any) {
      const state =
        (global as any).__stripeMockState ||
        ((global as any).__stripeMockState = {});

      state.paymentIntents = state.paymentIntents || {
        create: jest.fn(async () => ({
          id: "pi_test_123",
          object: "payment_intent",
          status: "succeeded",
          amount: 0,
          currency: "usd",
          metadata: {},
          created: Math.floor(Date.now() / 1000),
        })),
        search: jest.fn(async () => ({
          object: "search_result",
          data: [],
          has_more: false,
          url: "/v1/payment_intents/search",
        })),
      };

      state.refunds = state.refunds || {
        create: jest.fn(async (params: any) => ({
          id: "re_test_123",
          object: "refund",
          status: "succeeded",
          amount: params.amount,
          currency: "usd",
          payment_intent: params.payment_intent,
          created: Math.floor(Date.now() / 1000),
        })),
      };

      state.webhooks = state.webhooks || {
        constructEvent: jest.fn(
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
        ),
      };

      this.paymentIntents = state.paymentIntents;
      this.refunds = state.refunds;
      this.webhooks = state.webhooks;
    }
  }

  return { __esModule: true, default: StripeMock };
});
