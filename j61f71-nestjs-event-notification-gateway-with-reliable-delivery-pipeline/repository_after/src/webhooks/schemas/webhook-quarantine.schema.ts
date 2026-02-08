import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class WebhookQuarantine extends Document {
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

  @Prop({ required: true, type: Object })
  payload: Record<string, any>;

  @Prop({ required: true })
  lastError: string;

  @Prop({ required: true })
  attempts: number;

  @Prop()
  lastStatus?: number;
}

export const WebhookQuarantineSchema =
  SchemaFactory.createForClass(WebhookQuarantine);
WebhookQuarantineSchema.index({ endpointId: 1, createdAt: -1 });
