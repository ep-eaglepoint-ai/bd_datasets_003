
import { ObjectType, Field, ID, registerEnumType, Int } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { EncryptionTransformer } from '../../shared/encryption/encryption.transformer';

export enum MessageCategory {
  MEDICAL_QUESTION = 'MEDICAL_QUESTION',
  APPOINTMENT_REQUEST = 'APPOINTMENT_REQUEST',
  PRESCRIPTION_REFILL = 'PRESCRIPTION_REFILL',
  LAB_RESULTS = 'LAB_RESULTS',
  BILLING = 'BILLING',
  GENERAL = 'GENERAL',
}

registerEnumType(MessageCategory, { name: 'MessageCategory' });

@ObjectType()
@Entity()
export class Message {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  senderId: string;

  @Field()
  @Column()
  recipientId: string;

  @Field()
  @Column({ transformer: EncryptionTransformer, type: 'text' })
  content: string;

  @Field(() => MessageCategory)
  @Column({ default: MessageCategory.GENERAL })
  category: MessageCategory;

  @Field({ nullable: true })
  @CreateDateColumn()
  sentAt: Date;

  @Field({ nullable: true })
  @Column({ nullable: true })
  respondedAt?: Date;

  // ========== NEW: Response Time Tracking ==========
  @Field(() => Int, { nullable: true })
  @Column({ nullable: true })
  responseTimeMinutes?: number;

  // ========== NEW: Attachment Support ==========
  @Field({ nullable: true })
  @Column({ nullable: true })
  attachmentUrl?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  attachmentType?: string; // MIME type, e.g., 'image/jpeg', 'application/pdf'

  // ========== NEW: Thread Support ==========
  @Field({ nullable: true })
  @Column({ nullable: true })
  parentMessageId?: string; // For reply threading

  @Field()
  @Column({ default: false })
  isRead: boolean;

  @Field()
  @Column({ default: false })
  isArchived: boolean;
}
