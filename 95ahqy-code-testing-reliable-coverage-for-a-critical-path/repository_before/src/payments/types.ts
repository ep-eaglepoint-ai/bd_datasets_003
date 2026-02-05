export type PaymentStatus = 'pending' | 'succeeded' | 'failed';

export interface Payment {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  created_at: Date;
  updated_at: Date;
}
