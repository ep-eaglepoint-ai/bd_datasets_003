import { Process, Processor, OnQueueFailed } from "@nestjs/bull";
import { Job } from "bull";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { httpPost } from "../common/http.util";
import {
  RESPONSE_BODY_PREVIEW_MAX_BYTES,
  WEBHOOK_DELIVERY_JOB,
  WEBHOOK_DELIVERY_QUEUE,
  WEBHOOK_MAX_ATTEMPTS,
} from "./constants";
import { WebhookEndpoint } from "./schemas/webhook-endpoint.schema";
import { WebhookDeliveryLog } from "./schemas/webhook-delivery-log.schema";
import { WebhookQuarantine } from "./schemas/webhook-quarantine.schema";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { computeHmacSha256Hex } from "./utils/signature.util";
import { truncateUtf8ToMaxBytes } from "./utils/truncate.util";

export interface WebhookDeliveryJobData {
  endpointId: string;
  tenantId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
}

@Processor(WEBHOOK_DELIVERY_QUEUE)
export class WebhookDeliveryProcessor {
  constructor(
    @InjectModel(WebhookEndpoint.name)
    private readonly endpointModel: Model<WebhookEndpoint>,
    @InjectModel(WebhookDeliveryLog.name)
    private readonly logModel: Model<WebhookDeliveryLog>,
    @InjectModel(WebhookQuarantine.name)
    private readonly quarantineModel: Model<WebhookQuarantine>,
    private readonly circuitBreaker: CircuitBreakerService
  ) {}

  @Process({ name: WEBHOOK_DELIVERY_JOB, concurrency: 10 })
  async handle(job: Job<WebhookDeliveryJobData>) {
    const data = job.data;
    const endpoint = await this.endpointModel.findOne({
      _id: data.endpointId,
      tenantId: data.tenantId,
      isActive: true,
    });
    if (!endpoint) return;

    const gate = await this.circuitBreaker.canAttempt(endpoint._id.toString());
    if (!gate.allowed) {
      throw new Error(`Circuit open (retryAfter=${gate.retryAfterMs}ms)`);
    }

    const requestBody = JSON.stringify({
      id: data.eventId,
      type: data.eventType,
      tenantId: data.tenantId,
      payload: data.payload,
      occurredAt: new Date().toISOString(),
    });

    const signature = computeHmacSha256Hex(endpoint.secret, requestBody);

    const attempt = (job.attemptsMade ?? 0) + 1;

    const response = await httpPost(
      endpoint.url,
      requestBody,
      {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
      },
      30_000
    );

    const responseBodyPreview = truncateUtf8ToMaxBytes(
      response.body ?? "",
      RESPONSE_BODY_PREVIEW_MAX_BYTES
    );

    const isSuccess = response.status >= 200 && response.status < 300;
    await this.logModel.create({
      tenantId: data.tenantId,
      endpointId: endpoint._id.toString(),
      url: endpoint.url,
      eventType: data.eventType,
      eventId: data.eventId,
      attempt,
      requestBody,
      signature,
      responseStatus: response.status,
      responseBodyPreview,
      latencyMs: response.latencyMs,
      error: isSuccess
        ? undefined
        : response.status === 0
        ? response.body
        : `HTTP ${response.status}`,
    });

    if (isSuccess) {
      await this.circuitBreaker.recordSuccess(endpoint._id.toString());
      return;
    }

    await this.circuitBreaker.recordFailure(endpoint._id.toString());

    throw new Error(`Webhook delivery failed (status=${response.status})`);
  }

  @OnQueueFailed()
  async onFailed(job: Job<WebhookDeliveryJobData>, error: Error) {
    const attemptsMade = job.attemptsMade ?? 0;
    if (attemptsMade < WEBHOOK_MAX_ATTEMPTS) return;

    const data = job.data;
    const endpoint = await this.endpointModel.findOne({
      _id: data.endpointId,
      tenantId: data.tenantId,
    });
    if (!endpoint) return;

    await this.quarantineModel.create({
      tenantId: data.tenantId,
      endpointId: endpoint._id.toString(),
      url: endpoint.url,
      eventType: data.eventType,
      eventId: data.eventId,
      payload: data.payload,
      lastError: error?.message ?? "Delivery failed",
      attempts: attemptsMade,
    });
  }
}
