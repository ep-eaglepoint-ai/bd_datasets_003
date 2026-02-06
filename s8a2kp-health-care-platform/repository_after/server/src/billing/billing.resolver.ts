
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { BillingService } from './billing.service';
import { Invoice } from './entities/invoice.entity';

@Resolver(() => Invoice)
export class BillingResolver {
  constructor(private readonly billingService: BillingService) {}

  @Mutation(() => Invoice)
  createInvoice(
    @Args('patientId') patientId: string,
    @Args('amount') amount: number,
    @Args('description') description: string
  ) {
    return this.billingService.createInvoice(patientId, amount, description);
  }

  @Query(() => [Invoice], { name: 'invoices' })
  findAll() {
    return this.billingService.findAll();
  }
}
