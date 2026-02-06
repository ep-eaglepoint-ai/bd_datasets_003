
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { Provider } from './provider.entity';

export enum TimeOffType {
  VACATION = 'VACATION',
  SICK = 'SICK',
  PERSONAL = 'PERSONAL',
  CONFERENCE = 'CONFERENCE',
  HOLIDAY = 'HOLIDAY',
}

@ObjectType()
@Entity()
export class TimeOff {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => Provider)
  @ManyToOne(() => Provider)
  provider: Provider;

  @Column()
  providerId: string;

  @Field()
  @Column()
  startDate: Date;

  @Field()
  @Column()
  endDate: Date;

  @Field()
  @Column({ default: TimeOffType.PERSONAL })
  type: TimeOffType;

  @Field({ nullable: true })
  @Column({ nullable: true })
  reason?: string;

  @Field()
  @Column({ default: false })
  isFullDay: boolean;

  @Field({ nullable: true })
  @Column({ nullable: true })
  startTime?: string; // HH:mm for partial day off

  @Field({ nullable: true })
  @Column({ nullable: true })
  endTime?: string; // HH:mm for partial day off

  @Field()
  @Column({ default: 'APPROVED' })
  status: string; // PENDING, APPROVED, REJECTED

  @CreateDateColumn()
  createdAt: Date;
}
