
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MedicalRecord } from './entities/medical-record.entity';

@Injectable()
export class MedicalRecordService {
  constructor(
      @InjectRepository(MedicalRecord)
      private medicalRecordRepository: Repository<MedicalRecord>
  ) {}
  
  findAll() { return this.medicalRecordRepository.find(); }
}
