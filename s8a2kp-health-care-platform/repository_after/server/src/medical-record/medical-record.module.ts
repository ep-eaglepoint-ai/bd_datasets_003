
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicalRecordService } from './medical-record.service';
import { MedicalRecordResolver } from './medical-record.resolver';
import { MedicalRecord } from './entities/medical-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MedicalRecord])],
  providers: [MedicalRecordResolver, MedicalRecordService],
})
export class MedicalRecordModule {}
