import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { AppEvent } from "../events/events.service";
import { WebhookEndpoint } from "./schemas/webhook-endpoint.schema";
import { WebhooksService } from "./webhooks.service";

@Injectable()
export class WebhookDispatcherListener {
  constructor(
    @InjectModel(WebhookEndpoint.name)
    private readonly endpointModel: Model<WebhookEndpoint>,
    private readonly webhooksService: WebhooksService
  ) {}

  @OnEvent("app.event")
  async handleAppEvent(event: AppEvent) {
    const endpoints = await this.endpointModel.find({
      tenantId: event.tenantId,
      isActive: true,
      subscribedEvents: event.type,
    });

    await Promise.all(
      endpoints.map((endpoint) =>
        this.webhooksService.enqueueDeliveryIfSubscribed(endpoint, event)
      )
    );
  }
}
