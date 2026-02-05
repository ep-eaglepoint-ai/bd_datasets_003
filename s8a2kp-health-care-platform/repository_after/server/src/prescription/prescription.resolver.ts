
import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { PrescriptionService } from './prescription.service';
import { Prescription } from './entities/prescription.entity';

@Resolver(() => Prescription)
export class PrescriptionResolver {
  constructor(private readonly prescriptionService: PrescriptionService) {}

  @Mutation(() => Prescription)
  createPrescription(
    @Args('medicationName') medicationName: string,
    @Args('dosage') dosage: string,
    @Args('isControlledSubstance') isControlledSubstance: boolean,
    @Args('patientId', { nullable: true, defaultValue: 'patient-uuid' }) patientId: string,
    @Args('providerId', { nullable: true, defaultValue: 'provider-uuid' }) providerId: string,
    @Args('pharmacyId', { nullable: true }) pharmacyId?: string,
  ) {
    return this.prescriptionService.createPrescription(
      patientId,
      providerId,
      medicationName,
      dosage,
      isControlledSubstance,
      pharmacyId,
    );
  }

  @Mutation(() => Prescription)
  requestRefill(
    @Args('prescriptionId') prescriptionId: string,
    @Args('patientId') patientId: string,
  ) {
    return this.prescriptionService.requestRefill(prescriptionId, patientId);
  }

  @Query(() => [Prescription], { name: 'prescriptions' })
  findAll() {
    return this.prescriptionService.findAll();
  }

  @Query(() => [Prescription], { name: 'medicationHistory' })
  getMedicationHistory(@Args('patientId') patientId: string) {
    return this.prescriptionService.getPatientMedicationHistory(patientId);
  }
}
