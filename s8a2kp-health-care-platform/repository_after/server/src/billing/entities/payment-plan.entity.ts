
import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum PaymentPlanStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  DEFAULTED = 'DEFAULTED',
  CANCELLED = 'CANCELLED',
}

@ObjectType()
@Entity()
export class PaymentPlan {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  patientId: string;

  @Field()
  @Column()
  invoiceId: string;

  @Field(() => Float)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Field(() => Float)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  remainingBalance: number;

  @Field(() => Int)
  @Column()
  numberOfInstallments: number;

  @Field(() => Float)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  installmentAmount: number;

  @Field(() => Int)
  @Column({ default: 0 })
  installmentsPaid: number;

  @Field()
  @Column({ default: PaymentPlanStatus.ACTIVE })
  status: PaymentPlanStatus;

  @Field()
  @Column()
  nextPaymentDue: Date;

  @Field(() => Int)
  @Column({ default: 1 })
  paymentDayOfMonth: number; // 1-28

  @Field({ nullable: true })
  @Column({ nullable: true })
  paymentMethodId?: string; // Stripe/payment processor token

  @Field()
  @Column({ default: false })
  autoPayEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
