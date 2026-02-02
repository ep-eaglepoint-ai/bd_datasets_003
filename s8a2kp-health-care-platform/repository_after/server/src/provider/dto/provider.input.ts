
import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class CreateProviderInput {
  @Field()
  name: string;

  @Field()
  specialty: string;
}

@InputType()
export class AddScheduleInput {
  @Field()
  providerId: string;

  @Field(() => Int)
  dayOfWeek: number;

  @Field()
  startTime: string;

  @Field()
  endTime: string;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  maxOverBooking?: number;
}
