export type OrderStatus = 'created' | 'in_progress' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  customer_id: string;
  total_cents: number;
  status: OrderStatus;
  created_at: Date;
  updated_at: Date;
}
