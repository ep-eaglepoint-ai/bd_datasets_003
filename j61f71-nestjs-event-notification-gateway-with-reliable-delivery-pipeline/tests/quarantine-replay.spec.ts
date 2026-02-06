import { WebhooksService } from "../repository_after/src/webhooks/webhooks.service";
import {
  WEBHOOK_DELIVERY_JOB,
  WEBHOOK_MAX_ATTEMPTS,
} from "../repository_after/src/webhooks/constants";

describe("Quarantine replay", () => {
  it("resets circuit breaker and enqueues a fresh delivery", async () => {
    const endpointModel: any = {
      findOne: jest.fn(),
    };

    const quarantineEntry: any = {
      _id: "q1",
      endpointId: "e1",
      tenantId: "t1",
      url: "https://example.com/webhook",
      eventType: "order.placed",
      eventId: "evt_1",
      payload: { orderId: 123 },
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };

    const quarantineModel: any = {
      findOne: jest.fn().mockResolvedValue(quarantineEntry),
    };

    const logModel: any = {};

    const queue: any = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const circuitBreaker: any = {
      reset: jest.fn().mockResolvedValue(undefined),
    };

    const tenantService: any = {};

    const svc = new WebhooksService(
      tenantService,
      endpointModel,
      logModel,
      quarantineModel,
      queue,
      circuitBreaker
    );

    endpointModel.findOne.mockResolvedValue({
      _id: "e1",
      tenantId: "t1",
      isActive: true,
    });

    await svc.retryQuarantine("t1", "q1");

    expect(circuitBreaker.reset).toHaveBeenCalledWith("e1");
    expect(queue.add).toHaveBeenCalledWith(
      WEBHOOK_DELIVERY_JOB,
      expect.objectContaining({
        endpointId: "e1",
        tenantId: "t1",
        eventId: "evt_1",
      }),
      expect.objectContaining({ attempts: WEBHOOK_MAX_ATTEMPTS })
    );
    expect(quarantineEntry.deleteOne).toHaveBeenCalled();
  });
});
