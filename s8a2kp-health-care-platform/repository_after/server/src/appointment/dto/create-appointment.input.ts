
import { InputType, Field } from '@nestjs/graphql';
import { AppointmentType } from '../entities/appointment.entity';

@InputType()
export class CreateAppointmentInput {
  @Field()
  providerId: string;

  @Field()
  patientId: string;

  @Field()
  startTime: Date;

  @Field()
  endTime: Date;

  @Field(() => AppointmentType)
  type: AppointmentType;
}
