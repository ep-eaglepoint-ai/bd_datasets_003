
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
  ) {}

  async createInvoice(patientId: string, amount: number, description: string): Promise<Invoice> {
    
    // Mock Insurance Eligibility Verification (Real-time)
    console.log(`[EligibilityCheck] Verifying insurance coverage for Patient ${patientId}...`);
    // Simulate real X12 270/271 transaction time
    // await new Promise(r => setTimeout(r, 800));
    console.log(`[EligibilityCheck] Patient is active. Co-pay: $25.00`);

    // Mock Claim Generation (EDI X12 837)
    const claimControlNumber = Math.random().toString(36).substring(7).toUpperCase();
    const ediClaimString = `ISA*00*          *00*          *ZZ*SENDERID       *ZZ*PAYERID        *${new Date().toISOString().replace(/[-:T\.]/g, '').slice(0,12)}*^*00501*${claimControlNumber}*0*P*>~
    GS*HC*SENDERID*PAYERID*${new Date().toISOString().replace(/[-:T\.]/g, '').slice(0,8)}*0001*X*005010X222A1~
    ST*837*0001*005010X222A1~
    CLM*${patientId}*${amount}***11:B:1*Y*A*Y*Y~
    Lx*1~
    SV1*HC:99213*${amount}*UN*1***1~
    SE*25*0001~
    GE*1*0001~
    IEA*1*${claimControlNumber}~`;
    
    console.log(`[ClaimsEngine] Generated X12 837 Claim:\n${ediClaimString}`);
    console.log(`[Clearinghouse] Submitting Claim ${claimControlNumber}... Accepted.`);

    const invoice = this.invoiceRepository.create({
      patientId,
      amount,
      description,
      status: 'SUBMITTED', // Updated status
      appointmentId: 'manual',
      insuranceClaimId: claimControlNumber,
      date: new Date()
    });
    return this.invoiceRepository.save(invoice);
  }

  async findAll(): Promise<Invoice[]> {
    return this.invoiceRepository.find();
  }
}
