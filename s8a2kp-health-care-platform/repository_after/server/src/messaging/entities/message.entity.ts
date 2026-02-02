
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { EncryptionTransformer } from '../../shared/encryption/encryption.transformer';

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

  @Field()
  @Column()
  category: string; // MEDICAL, APPOINTMENT, REFILL
}
