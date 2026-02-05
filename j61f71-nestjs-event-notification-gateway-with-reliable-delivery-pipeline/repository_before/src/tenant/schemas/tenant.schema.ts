import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Tenant extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  apiKey: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 'standard' })
  plan: string;

  @Prop({ default: 1000 })
  monthlyEventLimit: number;

  @Prop({ default: 0 })
  eventsThisMonth: number;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
