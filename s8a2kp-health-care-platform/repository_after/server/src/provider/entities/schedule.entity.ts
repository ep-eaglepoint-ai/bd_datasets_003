
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
  @Field()
  @Column()
  endTime: string; // HH:mm

  @Field({ nullable: true })
  @Column({ nullable: true })
  recurrenceRule: string; // RRULE string e.g., "FREQ=WEEKLY;BYDAY=MO,WE"

  @Field({ nullable: true })
  @Column({ default: false })
  isOverbookable: boolean;

  @Field(() => Int, { defaultValue: 0 })
  @Column({ default: 0 })
  maxOverBooking: number;
}
