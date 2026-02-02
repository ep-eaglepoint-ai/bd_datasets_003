
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';

export enum AppointmentStatus {
  BOOKED = 'BOOKED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  WAITLIST = 'WAITLIST',
}

export enum AppointmentType {
  IN_PERSON = 'IN_PERSON',
  TELEHEALTH = 'TELEHEALTH',
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
  videoRoomSid: string;
}
