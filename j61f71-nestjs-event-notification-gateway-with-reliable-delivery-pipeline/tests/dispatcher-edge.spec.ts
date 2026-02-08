// Edge Case for Req 2 & 7

import { WebhookDispatcherListener } from "../repository_after/src/webhooks/webhook-dispatcher.listener";

describe("Webhook Dispatcher Edge Cases (Req 2)", () => {
  let listener: WebhookDispatcherListener;
  let mockEndpointModel: any;
  let mockWebhooksService: any;

  beforeEach(() => {
    mockEndpointModel = { find: jest.fn() };
    mockWebhooksService = { enqueueDeliveryIfSubscribed: jest.fn() };
    listener = new WebhookDispatcherListener(
      mockEndpointModel,
      mockWebhooksService
    );
  });

  // Req 2 Edge 1: No subscribers for event
  it("handles event with 0 subscribers gracefully (no jobs enqueued)", async () => {
    mockEndpointModel.find.mockResolvedValue([]); // No results

    await listener.handleAppEvent({
      id: "e1",
      type: "unused.event",
      tenantId: "t1",
      payload: {},
      occurredAt: new Date(),
    });

    expect(
      mockWebhooksService.enqueueDeliveryIfSubscribed
    ).not.toHaveBeenCalled();
  });

  // Req 2 Edge 2: Database failure during fetch
  it("handles database error without crashing process (logs error usually, but here ensure it throws or handles)", async () => {
    mockEndpointModel.find.mockRejectedValue(new Error("DB Connection Lost"));

    await expect(
      listener.handleAppEvent({
        id: "e1",
        type: "ev",
        tenantId: "t1",
        payload: {},
        occurredAt: new Date(),
      })
    ).rejects.toThrow("DB Connection Lost");

    expect(
      mockWebhooksService.enqueueDeliveryIfSubscribed
    ).not.toHaveBeenCalled();
  });
});
