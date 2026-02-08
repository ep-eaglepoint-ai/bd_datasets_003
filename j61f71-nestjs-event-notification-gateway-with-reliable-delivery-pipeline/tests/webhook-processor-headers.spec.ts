jest.mock("../repository_after/src/common/http.util", () => ({
  httpPost: jest.fn(),
}));

import { httpPost } from "../repository_after/src/common/http.util";
import { computeHmacSha256Hex } from "../repository_after/src/webhooks/utils/signature.util";
import { WebhookDeliveryProcessor } from "../repository_after/src/webhooks/webhook-delivery.processor";

describe("WebhookDeliveryProcessor", () => {
  it("attaches X-Webhook-Signature header with computed HMAC", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));

    const endpointModel: any = {
      findOne: jest.fn().mockResolvedValue({
        _id: "e1",
        tenantId: "t1",
        isActive: true,
        url: "https://example.com/webhook",
        secret: "supersecret",
      }),
    };

    const logModel: any = {
      create: jest.fn().mockResolvedValue(undefined),
    };

    const quarantineModel: any = {
      create: jest.fn().mockResolvedValue(undefined),
    };

    const circuitBreaker: any = {
      canAttempt: jest
        .fn()
        .mockResolvedValue({ allowed: true, state: "closed" }),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };

    (httpPost as any).mockResolvedValue({
      status: 200,
      headers: {},
      body: "ok",
      latencyMs: 12,
    });

    const processor = new WebhookDeliveryProcessor(
      endpointModel,
      logModel,
      quarantineModel,
      circuitBreaker
    );

    const job: any = {
      data: {
        endpointId: "e1",
        tenantId: "t1",
        eventId: "evt_1",
        eventType: "order.placed",
        payload: { orderId: 123 },
      },
      attemptsMade: 0,
    };

    const requestBody = JSON.stringify({
      id: "evt_1",
      type: "order.placed",
      tenantId: "t1",
      payload: { orderId: 123 },
      occurredAt: "2020-01-01T00:00:00.000Z",
    });
    const expectedSignature = computeHmacSha256Hex("supersecret", requestBody);

    await processor.handle(job);

    expect(httpPost).toHaveBeenCalledWith(
      "https://example.com/webhook",
      requestBody,
      expect.objectContaining({
        "Content-Type": "application/json",
        "X-Webhook-Signature": expectedSignature,
      }),
      30_000
    );

    jest.useRealTimers();
  });
});
