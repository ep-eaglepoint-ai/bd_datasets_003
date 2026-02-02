
import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { PatientService } from './patient.service';
import { Patient } from './entities/patient.entity';
import { CreatePatientInput } from './dto/create-patient.input';

@Resolver(() => Patient)
export class PatientResolver {
  constructor(private readonly patientService: PatientService) {}

  @Mutation(() => Patient)
  createPatient(@Args('createPatientInput') createPatientInput: CreatePatientInput) {
    return this.patientService.create(createPatientInput);
  }

  @Query(() => [Patient], { name: 'patients' })
  findAll() {
    return this.patientService.findAll();
  }

  @Query(() => Patient, { name: 'patient' })
  findOne(@Args('id', { type: () => ID }) id: string) {
    return this.patientService.findOne(id);
  }

  @Mutation(() => Patient)
  addDependent(
    @Args('guardianId') guardianId: string, 
    @Args('dependentId') dependentId: string
  ) {
    return this.patientService.addDependent(guardianId, dependentId);
  }

  @Mutation(() => Patient)
  signConsent(
    @Args('patientId') patientId: string,
    @Args('signature') signature: string
  ) {
    return this.patientService.signConsent(patientId, signature);
  }
}
