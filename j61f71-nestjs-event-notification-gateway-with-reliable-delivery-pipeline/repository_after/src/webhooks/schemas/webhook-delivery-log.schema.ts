import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class WebhookDeliveryLog extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  endpointId: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true, index: true })
  eventType: string;

  @Prop({ required: true })
  eventId: string;

  @Prop({ required: true })
  attempt: number;

  @Prop({ required: true })
  requestBody: string;

  @Prop({ required: true })
  signature: string;

  @Prop({ required: true })
  responseStatus: number;

  @Prop({ required: true })
  responseBodyPreview: string;

  @Prop({ required: true })
  latencyMs: number;

  @Prop()
  error?: string;
}

export const WebhookDeliveryLogSchema =
  SchemaFactory.createForClass(WebhookDeliveryLog);
WebhookDeliveryLogSchema.index({ endpointId: 1, createdAt: -1 });
