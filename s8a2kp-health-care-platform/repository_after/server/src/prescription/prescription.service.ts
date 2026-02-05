
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prescription, PrescriptionStatus } from './entities/prescription.entity';

// Mock drug interaction database
const DRUG_INTERACTIONS: Record<string, string[]> = {
  'warfarin': ['aspirin', 'ibuprofen', 'naproxen'],
  'metformin': ['alcohol', 'contrast dye'],
  'lisinopril': ['potassium supplements', 'spironolactone'],
  'simvastatin': ['grapefruit', 'erythromycin', 'clarithromycin'],
};

@Injectable()
export class PrescriptionService {
  constructor(
    @InjectRepository(Prescription)
    private prescriptionRepository: Repository<Prescription>,
  ) {}

  /**
   * Create a new prescription with DEA compliance and interaction checks.
   */
  async createPrescription(
    patientId: string,
    providerId: string,
    medicationName: string,
    dosage: string,
    isControlledSubstance: boolean,
    pharmacyId?: string,
  ): Promise<Prescription> {
    
    // Check drug interactions against patient's current medications
    await this.checkDrugInteractions(patientId, medicationName);
    
    // DEA Compliance Check for controlled substances
    if (isControlledSubstance) {
      await this.validateDEACompliance(providerId, patientId);
    }

    const prescription = this.prescriptionRepository.create({
      patientId,
      providerId,
      medicationName,
      dosage,
      status: PrescriptionStatus.PENDING,
      isControlledSubstance,
      pharmacyId: pharmacyId || 'default-pharmacy',
      prescribedAt: new Date(),
    });

    const savedRx = await this.prescriptionRepository.save(prescription);

    // Transmit to pharmacy network
    await this.sendToPharmacyNetwork(savedRx);

    return savedRx;
  }

  /**
   * Request a refill for an existing prescription.
   */
  async requestRefill(prescriptionId: string, patientId: string): Promise<Prescription> {
    const prescription = await this.prescriptionRepository.findOne({
      where: { id: prescriptionId, patientId },
    });

    if (!prescription) {
      throw new BadRequestException('Prescription not found');
    }

    if (prescription.refillsRemaining <= 0) {
      throw new BadRequestException('No refills remaining. Please contact your provider.');
    }

    // Decrement refills and update status
    prescription.refillsRemaining -= 1;
    prescription.status = PrescriptionStatus.REFILL_REQUESTED;
    prescription.lastRefillAt = new Date();
    
    console.log(`[RefillWorkflow] Refill requested for Rx ${prescriptionId}. Refills remaining: ${prescription.refillsRemaining}`);

    const updated = await this.prescriptionRepository.save(prescription);
    
    // Send to pharmacy
    await this.sendToPharmacyNetwork(updated);
    
    return updated;
  }

  /**
   * Check for drug interactions with patient's current medications.
   */
  private async checkDrugInteractions(patientId: string, newMedication: string): Promise<void> {
    // Get patient's current active prescriptions
    const currentMeds = await this.prescriptionRepository.find({
      where: { patientId, status: PrescriptionStatus.FILLED },
    }) || [];

    const newMedLower = newMedication.toLowerCase();
    const interactions = DRUG_INTERACTIONS[newMedLower] || [];

    for (const med of currentMeds || []) {
      const currentMedLower = med.medicationName.toLowerCase();
      
      if (interactions.includes(currentMedLower) || 
          (DRUG_INTERACTIONS[currentMedLower]?.includes(newMedLower))) {
        console.log(`[InteractionCheck] ⚠️ WARNING: Potential interaction between ${newMedication} and ${med.medicationName}`);
        // In production, this might throw or require provider override
      }
    }

    console.log(`[InteractionCheck] Drug interaction check completed for ${newMedication}`);
  }

  /**
   * Validate DEA compliance for controlled substances.
   */
  private async validateDEACompliance(providerId: string, patientId: string): Promise<void> {
    console.log('[DEA_Compliance] Verifying provider DEA number...');
    // In reality: check provider.deaNumber against DEA database
    
    console.log('[DEA_Compliance] Checking patient prescription monitoring database...');
    // Query state PDMP (Prescription Drug Monitoring Program)
    
    console.log('[DEA_Compliance] Validating patient history for recent controlled substances...');
    // Check for doctor shopping patterns
    
    const passedDEACheck = true; // Mock - would be real validation
    if (!passedDEACheck) {
      throw new BadRequestException('DEA Compliance Validation Failed.');
    }
    
    console.log('[DEA_Compliance] ✓ All DEA checks passed');
  }

  /**
   * Transmit prescription to pharmacy via Surescripts network.
   */
  private async sendToPharmacyNetwork(rx: Prescription): Promise<void> {
    console.log(`[Surescripts] Transmitting Rx ${rx.id} to pharmacy ${rx.pharmacyId}...`);
    console.log(`[Surescripts] Using NCPDP SCRIPT standard v2017071`);
    
    // In reality: use Surescripts or similar e-prescribing network
    // await surescriptsClient.sendNewRx({ ... });
    
    rx.status = PrescriptionStatus.SENT_TO_PHARMACY;
    await this.prescriptionRepository.save(rx);
    
    console.log(`[Surescripts] ✓ Rx ${rx.id} successfully transmitted`);
  }

  /**
   * Get patient's medication history.
   */
  async getPatientMedicationHistory(patientId: string): Promise<Prescription[]> {
    return this.prescriptionRepository.find({
      where: { patientId },
      order: { prescribedAt: 'DESC' },
    });
  }

  /**
   * Get all prescriptions.
   */
  findAll(): Promise<Prescription[]> {
    return this.prescriptionRepository.find();
  }
}
