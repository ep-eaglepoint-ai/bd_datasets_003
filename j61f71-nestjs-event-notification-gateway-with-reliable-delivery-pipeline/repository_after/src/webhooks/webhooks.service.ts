import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as crypto from "crypto";
import { Queue } from "bull";
import { InjectQueue } from "@nestjs/bull";
import { TenantService } from "../tenant/tenant.service";
import { WebhookEndpoint } from "./schemas/webhook-endpoint.schema";
import { WebhookDeliveryLog } from "./schemas/webhook-delivery-log.schema";
import { WebhookQuarantine } from "./schemas/webhook-quarantine.schema";
import {
  WEBHOOK_DELIVERY_JOB,
  WEBHOOK_DELIVERY_QUEUE,
  WEBHOOK_MAX_ATTEMPTS,
} from "./constants";
import { CircuitBreakerService } from "./circuit-breaker.service";

@Injectable()
export class WebhooksService {
  constructor(
    private readonly tenantService: TenantService,
    @InjectModel(WebhookEndpoint.name)
    private readonly endpointModel: Model<WebhookEndpoint>,
    @InjectModel(WebhookDeliveryLog.name)
    private readonly logModel: Model<WebhookDeliveryLog>,
    @InjectModel(WebhookQuarantine.name)
    private readonly quarantineModel: Model<WebhookQuarantine>,
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE) private readonly queue: Queue,
    private readonly circuitBreaker: CircuitBreakerService
  ) {}

  async requireTenantByApiKey(apiKey?: string) {
    if (!apiKey) throw new UnauthorizedException("API key required");
    const tenant = await this.tenantService.findByApiKey(apiKey);
    if (!tenant) throw new UnauthorizedException("Invalid API key");
    return tenant;
  }

  async createEndpoint(
    tenantId: string,
    url: string,
    subscribedEvents: string[] = []
  ) {
    const secret = crypto.randomBytes(32).toString("hex");
    try {
      const endpoint = await this.endpointModel.create({
        tenantId,
        url,
        secret,
        isActive: true,
        subscribedEvents,
      });

      return {
        id: endpoint._id.toString(),
        url: endpoint.url,
        subscribedEvents: endpoint.subscribedEvents,
        secret,
      };
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new BadRequestException(
          "Endpoint already exists for this tenant"
        );
      }
      throw err;
    }
  }

  async updateSubscriptions(
    tenantId: string,
    endpointId: string,
    subscribedEvents: string[]
  ) {
    const endpoint = await this.endpointModel.findOneAndUpdate(
      { _id: endpointId, tenantId },
      { $set: { subscribedEvents } },
      { new: true }
    );
    if (!endpoint) throw new NotFoundException("Webhook endpoint not found");
    return {
      id: endpoint._id.toString(),
      url: endpoint.url,
      subscribedEvents: endpoint.subscribedEvents,
      isActive: endpoint.isActive,
    };
  }

  async enqueueDeliveryIfSubscribed(
    endpoint: WebhookEndpoint,
    event: {
      id: string;
      type: string;
      tenantId: string;
      payload: Record<string, any>;
    }
  ) {
    if (!endpoint.isActive) return;
    if (!endpoint.subscribedEvents?.includes(event.type)) return;

    const can = await this.circuitBreaker.canAttempt(endpoint._id.toString());
    const delay = can.allowed ? 0 : can.retryAfterMs ?? 0;

    await this.queue.add(
      WEBHOOK_DELIVERY_JOB,
      {
        endpointId: endpoint._id.toString(),
        tenantId: event.tenantId,
        eventId: event.id,
        eventType: event.type,
        payload: event.payload,
      },
      {
        attempts: WEBHOOK_MAX_ATTEMPTS,
        backoff: { type: "exponentialJitter", delay: 60_000 },
        delay,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  }

  async listDeliveryLogs(
    tenantId: string,
    endpointId: string,
    from?: Date,
    to?: Date
  ) {
    const query: any = { tenantId, endpointId };
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = from;
      if (to) query.createdAt.$lte = to;
    }

    return this.logModel.find(query).sort({ createdAt: -1 }).limit(500);
  }

  async listQuarantine(tenantId: string, endpointId?: string) {
    const query: any = { tenantId };
    if (endpointId) query.endpointId = endpointId;
    return this.quarantineModel.find(query).sort({ createdAt: -1 }).limit(500);
  }

  async retryQuarantine(tenantId: string, quarantineId: string) {
    const entry = await this.quarantineModel.findOne({
      _id: quarantineId,
      tenantId,
    });
    if (!entry) throw new NotFoundException("Quarantine entry not found");

    const endpoint = await this.endpointModel.findOne({
      _id: entry.endpointId,
      tenantId,
      isActive: true,
    });
    if (!endpoint)
      throw new NotFoundException("Endpoint not found or inactive");

    await this.circuitBreaker.reset(endpoint._id.toString());

    await this.queue.add(
      WEBHOOK_DELIVERY_JOB,
      {
        endpointId: endpoint._id.toString(),
        tenantId,
        eventId: entry.eventId,
        eventType: entry.eventType,
        payload: entry.payload,
      },
      {
        attempts: WEBHOOK_MAX_ATTEMPTS,
        backoff: { type: "exponentialJitter", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    await entry.deleteOne();
    return { success: true };
  }
}
