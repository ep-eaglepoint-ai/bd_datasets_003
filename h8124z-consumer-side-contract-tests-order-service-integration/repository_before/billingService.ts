// Consumer (Billing Service)
// billingService.ts
type BillingInput = {
  orderId: string;
  amount: number;
  currency: string;
};

export function prepareBillingPayload(order: any): BillingInput {
  return {
    orderId: order.orderId,
    amount: order.totalAmount,
    currency: order.currency
  };
}
