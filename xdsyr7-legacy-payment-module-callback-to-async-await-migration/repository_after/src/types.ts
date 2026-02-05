export interface Card {
  number: string;
  expiry: string;
  cvv: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string; // Added for strict typing
  card: Card;
  items: OrderItem[];
  total: number;
  email: string;
}

export interface ChargeResult {
  chargeId: string;
  amount: number;
  last4: string;
}

export interface TransactionRecord {
  id: number;
  chargeId: string;
  amount: number;
  currency: string;
  status: string;
  created_at: Date;
}

export interface PaymentSuccessResponse {
  success: true;
  transactionId: number;
  chargeId: string;
}

export type PaymentCallback = (
  err: Error | null,
  result?: PaymentSuccessResponse,
) => void;
