
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { PaymentPlan } from './entities/payment-plan.entity';
import { BillingService } from './billing.service';
import { BillingResolver } from './billing.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, PaymentPlan])],
  providers: [BillingService, BillingResolver],
  exports: [BillingService],
})
export class BillingModule {}
