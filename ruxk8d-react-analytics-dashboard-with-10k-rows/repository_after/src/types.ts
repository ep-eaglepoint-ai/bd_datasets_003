export interface Transaction {
  id: string;
  date: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  category: string;
  merchant: string;
  description: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  metadata: Record<string, unknown>;
}

export interface FilterState {
  dateRange: { start: Date | null; end: Date | null };
  status: string[];
  minAmount: number | null;
  maxAmount: number | null;
  categories: string[];
  searchQuery: string;
}

export interface DashboardStats {
  totalAmount: number;
  transactionCount: number;
  averageAmount: number;
  statusBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
}
