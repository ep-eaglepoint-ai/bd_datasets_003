
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { PrescriptionService } from './prescription.service';
import { Prescription } from './entities/prescription.entity';

@Resolver(() => Prescription)
export class PrescriptionResolver {
  constructor(private readonly prescriptionService: PrescriptionService) {}

  @Mutation(() => Prescription)
  createPrescription(
    @Args('medicationName') medicationName: string,
    @Args('dosage') dosage: string,
    @Args('isControlledSubstance') isControlledSubstance: boolean
  ) {
    return this.prescriptionService.createPrescription(medicationName, dosage, isControlledSubstance);
  }

  @Query(() => [Prescription], { name: 'prescriptions' })
  findAll() {
    return this.prescriptionService.findAll();
  }
}
