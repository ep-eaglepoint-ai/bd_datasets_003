
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PatientService } from '../repository_after/server/src/patient/patient.service';
import { Patient } from '../repository_after/server/src/patient/entities/patient.entity';
import { PrescriptionService } from '../repository_after/server/src/prescription/prescription.service';
import { Prescription } from '../repository_after/server/src/prescription/entities/prescription.entity';
import { AppointmentService } from '../repository_after/server/src/appointment/appointment.service';
import { Appointment } from '../repository_after/server/src/appointment/entities/appointment.entity';
import { ProviderService } from '../repository_after/server/src/provider/provider.service';

describe('Backend Unit Tests', () => {
  let patientService: PatientService;
  let prescriptionService: PrescriptionService;
  
  const mockPatientRepo = {
    create: jest.fn().mockImplementation(dto => dto),
    save: jest.fn().mockImplementation(patient => Promise.resolve({ id: '123', ...patient })),
    find: jest.fn(),
    findOneBy: jest.fn(),
  };

  const mockPrescriptionRepo = {
    create: jest.fn().mockImplementation(dto => dto),
    save: jest.fn().mockImplementation(rx => Promise.resolve({ id: 'rx-123', ...rx })),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        { provide: getRepositoryToken(Patient), useValue: mockPatientRepo },
        PrescriptionService,
        { provide: getRepositoryToken(Prescription), useValue: mockPrescriptionRepo },
      ],
    }).compile();

    patientService = module.get<PatientService>(PatientService);
    prescriptionService = module.get<PrescriptionService>(PrescriptionService);
  });

  describe('PatientService', () => {
    it('should verify identity when docScanUrl is provided', async () => {
      const result = await patientService.create({ 
        email: 'test@test.com', 
        firstName: 'Test', 
        lastName: 'User',
        docScanUrl: 'http://docs.com/id.jpg' // Providing doc URL
      });
      expect(result.isVerified).toBe(true);
    });

    it('should NOT verify identity when docScanUrl is missing', async () => {
      const result = await patientService.create({ 
        email: 'test@test.com', 
        firstName: 'Test', 
        lastName: 'User'
        // No docScanUrl
      });
      expect(result.isVerified).toBe(false);
    });
  });

  describe('PrescriptionService', () => {
    it('should pass DEA check for controlled substance', async () => {
      // Mock console.log to avoid clutter
      jest.spyOn(console, 'log').mockImplementation(() => {});
      
      const result = await prescriptionService.createPrescription('patient-123', 'provider-123', 'Oxycodin', '10mg', true);
      expect(result.status).toBe('SENT_TO_PHARMACY');
      expect(mockPrescriptionRepo.save).toHaveBeenCalled();
    });

    it('should create normal prescription', async () => {
      const result = await prescriptionService.createPrescription('patient-123', 'provider-123', 'Ibuprofen', '200mg', false);
      expect(result.medicationName).toBe('Ibuprofen');
    });
  });
});
