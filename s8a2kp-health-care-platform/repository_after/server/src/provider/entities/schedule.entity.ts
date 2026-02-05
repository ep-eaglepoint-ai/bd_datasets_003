
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Provider } from './provider.entity';

@ObjectType()
@Entity()
export class Schedule {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => Provider)
  @ManyToOne(() => Provider, provider => provider.schedules)
  provider: Provider;

  @Column()
  providerId: string;

  @Field(() => Int)
  @Column()
  dayOfWeek: number; // 0=Sunday

  @Field()
  @Column()
  startTime: string; // HH:mm

  @Field()
  @Column()
  endTime: string; // HH:mm

  @Field({ nullable: true })
  @Column({ nullable: true })
  recurrenceRule?: string; // RRULE string e.g., "FREQ=WEEKLY;BYDAY=MO,WE"

  @Field({ nullable: true })
  @Column({ default: false })
  isOverbookable: boolean;

  @Field(() => Int, { defaultValue: 0 })
  @Column({ default: 0 })
  maxOverBooking: number;

  // ========== NEW: Buffer Times ==========
  @Field(() => Int, { defaultValue: 0 })
  @Column({ default: 0 })
  bufferMinutesBefore: number; // Buffer before each appointment

  @Field(() => Int, { defaultValue: 0 })
  @Column({ default: 0 })
  bufferMinutesAfter: number; // Buffer after each appointment

  // ========== NEW: Lunch Break ==========
  @Field({ nullable: true })
  @Column({ nullable: true })
  lunchStart?: string; // HH:mm - lunch break start

  @Field({ nullable: true })
  @Column({ nullable: true })
  lunchEnd?: string; // HH:mm - lunch break end

  // ========== NEW: Default Slot Duration ==========
  @Field(() => Int, { defaultValue: 30 })
  @Column({ default: 30 })
  defaultSlotDurationMinutes: number;
}
