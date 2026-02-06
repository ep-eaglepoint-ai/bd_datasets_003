
import { ObjectType, Field, ID, registerEnumType, Int } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum PrescriptionStatus {
  PENDING = 'PENDING',
  SENT_TO_PHARMACY = 'SENT_TO_PHARMACY',
  FILLED = 'FILLED',
  REFILL_REQUESTED = 'REFILL_REQUESTED',
  CANCELLED = 'CANCELLED',
}

registerEnumType(PrescriptionStatus, { name: 'PrescriptionStatus' });

@ObjectType()
@Entity()
export class Prescription {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  patientId: string;

  @Field()
  @Column()
  providerId: string;

  @Field()
  @Column()
  medicationName: string;

  @Field()
  @Column()
  dosage: string;

  @Field(() => PrescriptionStatus)
  @Column({ type: 'varchar', default: PrescriptionStatus.PENDING })
  status: PrescriptionStatus;

  @Field()
  @Column({ default: false })
  isControlledSubstance: boolean;

  @Field(() => Int)
  @Column({ default: 3 })
  refillsRemaining: number;

  @Field({ nullable: true })
  @Column({ nullable: true })
  pharmacyId: string;

  @Field({ nullable: true })
  @CreateDateColumn()
  prescribedAt: Date;

  @Field({ nullable: true })
  @Column({ nullable: true })
  lastRefillAt: Date;
}
