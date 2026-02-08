import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class WebhookEndpoint extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  secret: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  subscribedEvents: string[];
}

export const WebhookEndpointSchema =
  SchemaFactory.createForClass(WebhookEndpoint);
WebhookEndpointSchema.index({ tenantId: 1, url: 1 }, { unique: true });
