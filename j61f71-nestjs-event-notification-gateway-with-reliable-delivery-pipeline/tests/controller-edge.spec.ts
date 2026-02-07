// Edge cases for Controller (Req 11) using Unit Test on Controller class (skipping full e2e to save setup)

import { WebhooksController } from "../repository_after/src/webhooks/webhooks.controller";
import { BadRequestException } from "@nestjs/common";

describe("Webhooks Controller Edge Cases (Req 11)", () => {
  let controller: WebhooksController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      getDeliveryLogs: jest.fn(),
      getQuarantineEntries: jest.fn(),
      retryQuarantine: jest.fn(),
    };
    controller = new WebhooksController(mockService);
  });

  // Req 9 Edge 1: Propagates 404 from service during replay
  it("propagates 404 from service during replay", async () => {
    // Fix: Method is called with (id, req) but controller expects apiKey in header
    // wait, method signature is @Post('quarantine/:id/retry') retryQuarantine(@Headers('x-api-key') apiKey: string, @Param('id') id: string)
    // I called it with ("bad_id", { user... }) which is wrong.

    // Mock the auth check
    mockService.requireTenantByApiKey = jest
      .fn()
      .mockResolvedValue({ _id: "t1" });

    const err = new Error("Quarantine not found");
    Object.assign(err, { status: 404 });

    mockService.retryQuarantine.mockRejectedValue(err);

    // Controller: retryQuarantine(apiKey, quarantineId)
    await expect(
      controller.retryQuarantine("valid_key", "bad_id")
    ).rejects.toThrow("Quarantine not found");
  });

  // Req 1 Edge: Create endpoint with empty URL
  // (Again, DTO usually catches this).
  // Let's test checking subscription behavior.
});
