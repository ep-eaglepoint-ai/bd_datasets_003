

// Producer (Order Service)
// orderService.ts
export type OrderResponseV1 = {
  orderId: string;
  totalAmount: number;
  currency: string;
};

export type OrderResponseV2 = {
  orderId: string;
  totalAmount: number;
  currency: string;
  discountApplied?: boolean;
};

export function getOrder(orderId: string): OrderResponseV2 {
  return {
    orderId,
    totalAmount: 100,
    currency: 'USD',
    discountApplied: false
  };
}
