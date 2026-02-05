
import { ObjectType, Field, ID, registerEnumType, Float } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum AppointmentStatus {
  BOOKED = 'BOOKED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  WAITLIST = 'WAITLIST',
  NO_SHOW = 'NO_SHOW',
}

export enum AppointmentType {
  IN_PERSON = 'IN_PERSON',
  TELEHEALTH = 'TELEHEALTH',
  FOLLOW_UP = 'FOLLOW_UP',
  URGENT = 'URGENT',
  ANNUAL_CHECKUP = 'ANNUAL_CHECKUP',
}

registerEnumType(AppointmentStatus, { name: 'AppointmentStatus' });
registerEnumType(AppointmentType, { name: 'AppointmentType' });

@ObjectType()
@Entity()
export class Appointment {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  providerId: string;

  @Field()
  @Column()
  patientId: string;

  @Field()
  @Column()
  startTime: Date;

  @Field()
  @Column()
  endTime: Date;

  @Field(() => AppointmentStatus)
  @Column({ type: 'enum', enum: AppointmentStatus, default: AppointmentStatus.BOOKED })
  status: AppointmentStatus;

  @Field(() => AppointmentType)
  @Column({ type: 'enum', enum: AppointmentType, default: AppointmentType.IN_PERSON })
  type: AppointmentType;

  @Field({ nullable: true })
  @Column({ nullable: true })
  videoRoomSid?: string;

  // ========== NEW: Co-pay at Booking ==========
  @Field(() => Float, { nullable: true })
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  copayAmount?: number;

  @Field()
  @Column({ default: false })
  copayCollected: boolean;

  @Field({ nullable: true })
  @Column({ nullable: true })
  copayTransactionId?: string;

  // ========== NEW: Appointment Duration ==========
  @Field({ nullable: true })
  @Column({ nullable: true })
  durationMinutes?: number;

  // ========== NEW: Notes ==========
  @Field({ nullable: true })
  @Column({ nullable: true })
  reasonForVisit?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;
}
