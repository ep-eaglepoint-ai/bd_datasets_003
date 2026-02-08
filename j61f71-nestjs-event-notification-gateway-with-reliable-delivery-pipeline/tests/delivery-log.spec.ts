jest.mock("../repository_after/src/common/http.util", () => ({
  httpPost: jest.fn(),
}));

import { httpPost } from "../repository_after/src/common/http.util";
import { WebhookDeliveryProcessor } from "../repository_after/src/webhooks/webhook-delivery.processor";
import { computeHmacSha256Hex } from "../repository_after/src/webhooks/utils/signature.util";

describe("WebhookDeliveryProcessor - Delivery Log", () => {
  let processor: WebhookDeliveryProcessor;
  let mockEndpointModel: any;
  let mockLogModel: any;
  let mockQuarantineModel: any;
  let mockCircuitBreaker: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockEndpointModel = {
      findOne: jest.fn(),
    };
    mockLogModel = {
      create: jest.fn().mockResolvedValue({}),
    };
    mockQuarantineModel = {
      create: jest.fn(),
    };
    mockCircuitBreaker = {
      canAttempt: jest.fn().mockResolvedValue({ allowed: true }),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    };

    processor = new WebhookDeliveryProcessor(
      mockEndpointModel,
      mockLogModel,
      mockQuarantineModel,
      mockCircuitBreaker
    );
  });

  it("logs all required fields: URL, status, response preview, latency, attempt", async () => {
    const start = Date.now();
    jest.useFakeTimers();
    jest.setSystemTime(start);

    const endpoint = {
      _id: "ep_1",
      tenantId: "t_1",
      url: "http://test.com/webhook",
      secret: "test_secret",
      isActive: true,
    };
    mockEndpointModel.findOne.mockResolvedValue(endpoint);

    const job: any = {
      data: {
        endpointId: "ep_1",
        tenantId: "t_1",
        eventId: "ev_1",
        eventType: "order.placed",
        payload: { orderId: 123 },
      },
      attemptsMade: 2, // 3rd attempt (0-based + 1 = 3 in logs?) Code uses attemptsMade + 1
    };

    // Correct signature gen
    const reqBody = JSON.stringify({
      id: "ev_1",
      type: "order.placed",
      tenantId: "t_1",
      payload: { orderId: 123 },
      occurredAt: new Date().toISOString(),
    });
    const sig = computeHmacSha256Hex("test_secret", reqBody);

    (httpPost as any).mockResolvedValue({
      status: 201,
      body: "Created " + "x".repeat(100),
      latencyMs: 150,
      headers: {},
    });

    await processor.handle(job);

    expect(mockLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: "ep_1",
        url: "http://test.com/webhook",
        responseStatus: 201, // status
        responseBodyPreview: expect.stringMatching(/^Created x+/), // body preview
        latencyMs: 150, // latency
        attempt: 3, // attemptsMade(2) + 1
        tenantId: "t_1",
        eventType: "order.placed",
        eventId: "ev_1",
        signature: sig,
      })
    );

    jest.useRealTimers();
  });
});
