
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MedicalRecord } from './entities/medical-record.entity';

export enum RecordType {
  VISIT_SUMMARY = 'VISIT_SUMMARY',
  LAB_RESULT = 'LAB_RESULT',
  IMAGING_REPORT = 'IMAGING_REPORT',
  IMMUNIZATION = 'IMMUNIZATION',
}

export interface LabResult {
  testName: string;
  value: number;
  unit: string;
  referenceMin: number;
  referenceMax: number;
  isAbnormal: boolean;
}

@Injectable()
export class MedicalRecordService {
  constructor(
    @InjectRepository(MedicalRecord)
    private medicalRecordRepository: Repository<MedicalRecord>,
  ) {}

  /**
   * Get all medical records.
   */
  findAll(): Promise<MedicalRecord[]> {
    return this.medicalRecordRepository.find({ order: { date: 'DESC' } });
  }

  /**
   * Get patient's medical records by type.
   */
  async findByPatient(patientId: string, recordType?: RecordType): Promise<MedicalRecord[]> {
    const where: any = { patientId };
    if (recordType) {
      where.recordType = recordType;
    }
    return this.medicalRecordRepository.find({ where, order: { date: 'DESC' } });
  }

  /**
   * Export medical records in CCDA format (HL7 CDA R2).
   */
  async exportAsCCDA(patientId: string): Promise<string> {
    const records = await this.findByPatient(patientId);
    
    // Generate CCDA XML structure
    const ccda = this.generateCCDADocument(patientId, records);
    
    console.log(`[Export] Generated CCDA document for patient ${patientId}`);
    return ccda;
  }

  /**
   * Export medical records as PDF.
   */
  async exportAsPDF(patientId: string): Promise<string> {
    const records = await this.findByPatient(patientId);
    
    // In real implementation, use PDFKit or similar
    console.log(`[Export] Generating PDF for patient ${patientId} with ${records.length} records`);
    
    // Return mock PDF URL
    return `/api/exports/medical-records-${patientId}-${Date.now()}.pdf`;
  }

  /**
   * Get lab results with reference ranges for trend analysis.
   */
  async getLabResults(patientId: string): Promise<LabResult[]> {
    const labRecords = await this.findByPatient(patientId, RecordType.LAB_RESULT);
    
    // Parse encrypted data field and add reference ranges
    return labRecords.map(record => {
      try {
        const data = JSON.parse(record.data);
        return {
          ...data,
          referenceMin: data.referenceMin || 0,
          referenceMax: data.referenceMax || 100,
          isAbnormal: data.value < data.referenceMin || data.value > data.referenceMax,
        };
      } catch {
        return {
          testName: 'Unknown',
          value: 0,
          unit: '',
          referenceMin: 0,
          referenceMax: 100,
          isAbnormal: false,
        };
      }
    });
  }

  /**
   * Get immunization records.
   */
  async getImmunizations(patientId: string): Promise<MedicalRecord[]> {
    return this.findByPatient(patientId, RecordType.IMMUNIZATION);
  }

  /**
   * Share records via Health Information Exchange (HIE).
   */
  async shareViaHIE(patientId: string, recipientOrgId: string): Promise<boolean> {
    const ccda = await this.exportAsCCDA(patientId);
    
    console.log(`[HIE] Initiating Direct Message to organization ${recipientOrgId}`);
    console.log(`[HIE] Transmitting CCDA document via Direct Protocol...`);
    
    // In real implementation: use Direct messaging standard
    // await directClient.sendMessage({ to: recipientEmail, attachment: ccda });
    
    console.log(`[HIE] ✓ Records shared successfully`);
    return true;
  }

  /**
   * Generate CCDA document (mock implementation).
   */
  private generateCCDADocument(patientId: string, records: MedicalRecord[]): string {
    // Real implementation would use proper HL7 CCDA library
    return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <recordTarget>
    <patientRole>
      <id root="${patientId}"/>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>
      ${records.map(r => `
      <component>
        <section>
          <code code="${r.recordType}" displayName="${r.recordType}"/>
          <text>${r.data}</text>
          <effectiveTime value="${r.date.toISOString()}"/>
        </section>
      </component>
      `).join('')}
    </structuredBody>
  </component>
</ClinicalDocument>`;
  }
}
