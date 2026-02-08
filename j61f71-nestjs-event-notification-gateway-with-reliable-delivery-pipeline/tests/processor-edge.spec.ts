import { WebhookDeliveryProcessor } from "../repository_after/src/webhooks/webhook-delivery.processor";

describe("Processor Edge Cases (Req 8)", () => {
  let processor: WebhookDeliveryProcessor;
  let mockEndpointModel: any;
  let mockLogModel: any;
  let mockQuarantineModel: any;
  let mockCircuitBreaker: any;

  beforeEach(() => {
    mockEndpointModel = { findOne: jest.fn() };
    mockLogModel = { create: jest.fn() };
    mockQuarantineModel = { create: jest.fn() };
    mockCircuitBreaker = { canAttempt: jest.fn() };

    processor = new WebhookDeliveryProcessor(
      mockEndpointModel,
      mockLogModel,
      mockQuarantineModel,
      mockCircuitBreaker
    );
  });

  // Req 8 Edge 1: OnQueueFailed but endpoint deleted (zombie job)
  it("halts quarantine creation if endpoint is missing (deleted during retries)", async () => {
    const job: any = {
      attemptsMade: 10,
      data: { endpointId: "ep_deleted", tenantId: "t1" },
    };
    const err = new Error("Failed");

    // Endpoint not found
    mockEndpointModel.findOne.mockResolvedValue(null);

    await processor.onFailed(job, err);

    expect(mockQuarantineModel.create).not.toHaveBeenCalled();
  });

  // Req 8 Edge 2: OnQueueFailed with null/undefined error
  it("handles null error object in OnQueueFailed", async () => {
    const job: any = {
      attemptsMade: 10,
      data: { endpointId: "ep_valid", tenantId: "t1" },
    };

    mockEndpointModel.findOne.mockResolvedValue({
      _id: "ep_valid",
      url: "http://..",
    });

    // Pass undefined error
    await processor.onFailed(job, undefined as any);

    expect(mockQuarantineModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "Delivery failed", // Default fallback
      })
    );
  });
});
