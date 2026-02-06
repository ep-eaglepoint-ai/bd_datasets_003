import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CreateWebhookEndpointDto } from "./dto/create-endpoint.dto";
import { UpdateWebhookSubscriptionsDto } from "./dto/update-subscriptions.dto";
import { WebhooksService } from "./webhooks.service";

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post("endpoints")
  async createEndpoint(
    @Headers("x-api-key") apiKey: string,
    @Body() dto: CreateWebhookEndpointDto
  ) {
    const tenant = await this.webhooksService.requireTenantByApiKey(apiKey);
    return this.webhooksService.createEndpoint(
      tenant._id.toString(),
      dto.url,
      dto.subscribedEvents ?? []
    );
  }

  @Patch("endpoints/:id/subscriptions")
  async updateSubscriptions(
    @Headers("x-api-key") apiKey: string,
    @Param("id") endpointId: string,
    @Body() dto: UpdateWebhookSubscriptionsDto
  ) {
    const tenant = await this.webhooksService.requireTenantByApiKey(apiKey);
    return this.webhooksService.updateSubscriptions(
      tenant._id.toString(),
      endpointId,
      dto.subscribedEvents
    );
  }

  @Get("endpoints/:id/deliveries")
  async listDeliveries(
    @Headers("x-api-key") apiKey: string,
    @Param("id") endpointId: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const tenant = await this.webhooksService.requireTenantByApiKey(apiKey);
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.webhooksService.listDeliveryLogs(
      tenant._id.toString(),
      endpointId,
      fromDate,
      toDate
    );
  }

  @Get("quarantine")
  async listQuarantine(
    @Headers("x-api-key") apiKey: string,
    @Query("endpointId") endpointId?: string
  ) {
    const tenant = await this.webhooksService.requireTenantByApiKey(apiKey);
    return this.webhooksService.listQuarantine(
      tenant._id.toString(),
      endpointId
    );
  }

  @Post("quarantine/:id/retry")
  async retryQuarantine(
    @Headers("x-api-key") apiKey: string,
    @Param("id") quarantineId: string
  ) {
    const tenant = await this.webhooksService.requireTenantByApiKey(apiKey);
    return this.webhooksService.retryQuarantine(
      tenant._id.toString(),
      quarantineId
    );
  }
}
