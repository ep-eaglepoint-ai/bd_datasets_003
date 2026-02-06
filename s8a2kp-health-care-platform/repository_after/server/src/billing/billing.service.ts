
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { PaymentPlan, PaymentPlanStatus } from './entities/payment-plan.entity';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(PaymentPlan)
    private paymentPlanRepository: Repository<PaymentPlan>,
  ) {}

  async createInvoice(patientId: string, amount: number, description: string): Promise<Invoice> {
    // Mock Insurance Eligibility Verification (Real-time)
    console.log(`[EligibilityCheck] Verifying insurance coverage for Patient ${patientId}...`);
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
      status: 'SUBMITTED',
      appointmentId: 'manual',
      insuranceClaimId: claimControlNumber,
      date: new Date()
    });
    return this.invoiceRepository.save(invoice);
  }

  /**
   * Create a payment plan for a patient
   */
  async createPaymentPlan(
    patientId: string,
    invoiceId: string,
    totalAmount: number,
    numberOfInstallments: number,
    paymentDayOfMonth: number = 1,
    autoPayEnabled: boolean = false,
    paymentMethodId?: string,
  ): Promise<PaymentPlan> {
    if (numberOfInstallments < 2 || numberOfInstallments > 24) {
      throw new BadRequestException('Payment plans must be between 2-24 installments');
    }

    if (totalAmount < 50) {
      throw new BadRequestException('Minimum amount for payment plan is $50');
    }

    const installmentAmount = Math.ceil((totalAmount / numberOfInstallments) * 100) / 100;
    
    // Calculate next payment due date
    const now = new Date();
    const nextPaymentDue = new Date(now.getFullYear(), now.getMonth() + 1, paymentDayOfMonth);

    const paymentPlan = this.paymentPlanRepository.create({
      patientId,
      invoiceId,
      totalAmount,
      remainingBalance: totalAmount,
      numberOfInstallments,
      installmentAmount,
      installmentsPaid: 0,
      status: PaymentPlanStatus.ACTIVE,
      nextPaymentDue,
      paymentDayOfMonth,
      autoPayEnabled,
      paymentMethodId,
    });

    console.log(`[PaymentPlan] Created ${numberOfInstallments}-installment plan for $${totalAmount.toFixed(2)}`);
    console.log(`[PaymentPlan] Monthly payment: $${installmentAmount.toFixed(2)}, First due: ${nextPaymentDue.toISOString().split('T')[0]}`);

    return this.paymentPlanRepository.save(paymentPlan);
  }

  /**
   * Process a payment on a payment plan
   */
  async makePayment(paymentPlanId: string, amount: number): Promise<PaymentPlan> {
    const plan = await this.paymentPlanRepository.findOne({ where: { id: paymentPlanId } });
    if (!plan) {
      throw new BadRequestException('Payment plan not found');
    }

    if (plan.status !== PaymentPlanStatus.ACTIVE) {
      throw new BadRequestException('Payment plan is not active');
    }

    // Process payment (mock)
    console.log(`[Payment] Processing $${amount.toFixed(2)} payment on plan ${paymentPlanId}`);

    plan.remainingBalance = Math.max(0, plan.remainingBalance - amount);
    plan.installmentsPaid += 1;

    if (plan.remainingBalance <= 0) {
      plan.status = PaymentPlanStatus.COMPLETED;
      console.log(`[PaymentPlan] Plan ${paymentPlanId} fully paid off!`);
    } else {
      // Calculate next payment due
      const nextMonth = new Date(plan.nextPaymentDue);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      plan.nextPaymentDue = nextMonth;
    }

    return this.paymentPlanRepository.save(plan);
  }

  /**
   * Get patient's payment plans
   */
  async getPatientPaymentPlans(patientId: string): Promise<PaymentPlan[]> {
    return this.paymentPlanRepository.find({ where: { patientId } });
  }

  /**
   * Get overdue payment plans
   */
  async getOverduePaymentPlans(): Promise<PaymentPlan[]> {
    const now = new Date();
    const plans = await this.paymentPlanRepository.find({
      where: { status: PaymentPlanStatus.ACTIVE },
    });

    return plans.filter(plan => plan.nextPaymentDue < now);
  }

  async findAll(): Promise<Invoice[]> {
    return this.invoiceRepository.find();
  }
}
