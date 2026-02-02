
import { Resolver, Query } from '@nestjs/graphql';
import { MedicalRecordService } from './medical-record.service';
import { MedicalRecord } from './entities/medical-record.entity';

@Resolver(() => MedicalRecord)
export class MedicalRecordResolver {
  constructor(private readonly medicalRecordService: MedicalRecordService) {}

  @Query(() => [MedicalRecord], { name: 'medicalRecords' })
  findAll() {
    return this.medicalRecordService.findAll();
  }
}
