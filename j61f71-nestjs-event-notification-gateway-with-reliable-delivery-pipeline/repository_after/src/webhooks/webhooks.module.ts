import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { TenantModule } from "../tenant/tenant.module";
import { WEBHOOK_DELIVERY_QUEUE } from "./constants";
import {
  WebhookEndpoint,
  WebhookEndpointSchema,
} from "./schemas/webhook-endpoint.schema";
import {
  WebhookDeliveryLog,
  WebhookDeliveryLogSchema,
} from "./schemas/webhook-delivery-log.schema";
import {
  WebhookQuarantine,
  WebhookQuarantineSchema,
} from "./schemas/webhook-quarantine.schema";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { WebhookDeliveryProcessor } from "./webhook-delivery.processor";
import { WebhookDispatcherListener } from "./webhook-dispatcher.listener";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { REDIS_CLIENT } from "./redis.constants";
import { computeExponentialBackoffWithJitterMs } from "./utils/retry.util";

@Module({
  imports: [
    TenantModule,
    MongooseModule.forFeature([
      { name: WebhookEndpoint.name, schema: WebhookEndpointSchema },
      { name: WebhookDeliveryLog.name, schema: WebhookDeliveryLogSchema },
      { name: WebhookQuarantine.name, schema: WebhookQuarantineSchema },
    ]),
    BullModule.registerQueue({
      name: WEBHOOK_DELIVERY_QUEUE,
      settings: {
        backoffStrategies: {
          exponentialJitter: (attemptsMade: number) =>
            computeExponentialBackoffWithJitterMs(attemptsMade),
        },
      },
    }),
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhookDeliveryProcessor,
    WebhookDispatcherListener,
    CircuitBreakerService,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>("REDIS_HOST") || "localhost";
        const port = parseInt(config.get<string>("REDIS_PORT") || "6379", 10);
        return new Redis({ host, port });
      },
    },
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
