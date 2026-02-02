
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prescription } from './entities/prescription.entity';

@Injectable()
export class PrescriptionService {
  constructor(
      @InjectRepository(Prescription)
      private prescriptionRepository: Repository<Prescription>
  ) {}
  
  async createPrescription(medicationName: string, dosage: string, isControlledSubstance: boolean): Promise<Prescription> {
    
    // Mock DEA Compliance Check
    if (isControlledSubstance) {
        console.log('[DEA_Compliance] Verifying provider DEA number...');
        // In reality, check provider.deaNumber against generic database
        console.log('[DEA_Compliance] Validating patient history for recent opioids...');
        // simulate check
        const passedDEACheck = true;
        if (!passedDEACheck) {
            throw new Error('DEA Compliance Validation Failed.');
        }
    }

    const prescription = this.prescriptionRepository.create({
        medicationName,
        dosage,
        status: 'PENDING',
        patientId: 'patient-uuid', // Mock
        providerId: 'provider-uuid' // Mock
    });

    const savedRx = await this.prescriptionRepository.save(prescription);

    // Mock Pharmacy Network Transmission (Surescripts)
    this.sendToPharmacyNetwork(savedRx);

    return savedRx;
  }

  private sendToPharmacyNetwork(rx: Prescription) {
      console.log(`[SurescriptsMock] Transmitting Rx ${rx.id} to pharmacy network via NCPDP script...`);
      // Simulate network latency
      setTimeout(() => {
      }, 500);
  }

  findAll() {
      return this.prescriptionRepository.find();
  }
}
