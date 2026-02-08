import {
  WebhookDeliveryProcessor,
  WebhookDeliveryJobData,
} from "../repository_after/src/webhooks/webhook-delivery.processor";
import { WEBHOOK_MAX_ATTEMPTS } from "../repository_after/src/webhooks/constants";

describe("WebhookDeliveryProcessor - Quarantine Integration", () => {
  let processor: WebhookDeliveryProcessor;
  let mockEndpointModel: any;
  let mockLogModel: any;
  let mockQuarantineModel: any;
  let mockCircuitBreaker: any;

  beforeEach(() => {
    mockEndpointModel = {
      findOne: jest.fn(),
    };
    mockLogModel = {
      create: jest.fn(),
    };
    mockQuarantineModel = {
      create: jest.fn().mockResolvedValue({}),
    };
    mockCircuitBreaker = {
      canAttempt: jest.fn(),
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

  it("creates quarantine entry when retries are exhausted (OnQueueFailed)", async () => {
    const job: any = {
      attemptsMade: WEBHOOK_MAX_ATTEMPTS, // Max attempts reached
      data: {
        endpointId: "ep_1",
        tenantId: "t_1",
        eventId: "ev_1",
        eventType: "user.created",
        payload: { id: 1 },
      },
      finished: jest.fn(),
    };
    const error = new Error("Final failure");

    mockEndpointModel.findOne.mockResolvedValue({
      _id: "ep_1",
      url: "http://example.com",
      tenantId: "t_1",
      secret: "sec",
    });

    await processor.onFailed(job, error);

    expect(mockEndpointModel.findOne).toHaveBeenCalledWith({
      _id: "ep_1",
      tenantId: "t_1",
    });

    expect(mockQuarantineModel.create).toHaveBeenCalledWith({
      tenantId: "t_1",
      endpointId: "ep_1",
      url: "http://example.com",
      eventType: "user.created",
      eventId: "ev_1",
      payload: { id: 1 },
      lastError: "Final failure",
      attempts: WEBHOOK_MAX_ATTEMPTS,
    });
  });

  it("does not create quarantine if retries are not exhausted", async () => {
    const job: any = {
      attemptsMade: WEBHOOK_MAX_ATTEMPTS - 1, // One less than max
      data: {},
    };
    const error = new Error("Temporary failure");

    await processor.onFailed(job, error);

    expect(mockQuarantineModel.create).not.toHaveBeenCalled();
  });
});
