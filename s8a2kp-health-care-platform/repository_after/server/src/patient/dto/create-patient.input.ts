
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreatePatientInput {
  @Field()
  email: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field({ nullable: true })
  docScanUrl?: string;

  @Field({ nullable: true })
  insuranceData?: string;
}
