
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './entities/patient.entity';
import { CreatePatientInput } from './dto/create-patient.input';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
  ) {}

  async create(createPatientInput: CreatePatientInput): Promise<Patient> {
    const patient = this.patientRepository.create(createPatientInput);
    
    // Mock Identity Verification Logic
    // In real world, we would send patient.docScanUrl to a service like Onfido or Jumio
    if (createPatientInput.docScanUrl) {
        console.log(`[MockIdentityService] Verifying document at ${createPatientInput.docScanUrl}...`);
        // Simulate processing time
        // await new Promise(resolve => setTimeout(resolve, 1000));
        patient.isVerified = true; 
    } else {
        patient.isVerified = false; // Require manual review if no doc provided
    }

    return this.patientRepository.save(patient);
  }

  findAll(): Promise<Patient[]> {
    return this.patientRepository.find();
  }

  async findOne(id: string): Promise<Patient> {
    const patient = await this.patientRepository.findOne({ 
        where: { id },
        relations: ['dependents', 'guardian']
    });
    if (!patient) throw new Error('Patient not found');
    return patient;
  }

  async addDependent(guardianId: string, dependentId: string): Promise<Patient> {
      const guardian = await this.findOne(guardianId);
      const dependent = await this.findOne(dependentId);

      if (dependent.id === guardian.id) {
          throw new Error('Cannot add self as dependent');
      }

      dependent.guardian = guardian;
      await this.patientRepository.save(dependent);
      
      // Reload guardian to show updated dependents
      return this.findOne(guardianId);
  }

  async signConsent(patientId: string, signature: string): Promise<Patient> {
      const patient = await this.findOne(patientId);
      patient.consentSignature = signature;
      return this.patientRepository.save(patient);
  }
}
