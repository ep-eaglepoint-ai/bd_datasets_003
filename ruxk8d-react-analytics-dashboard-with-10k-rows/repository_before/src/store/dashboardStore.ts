import { create } from 'zustand';
import { Transaction, FilterState, DashboardStats } from '../types';

interface DashboardState {
  transactions: Transaction[];
  filters: FilterState;
  stats: DashboardStats;
  isLoading: boolean;
  setTransactions: (transactions: Transaction[]) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
}

const calculateStats = (transactions: Transaction[]): DashboardStats => {
  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  const statusBreakdown: Record<string, number> = {};
  const categoryBreakdown: Record<string, number> = {};
  
  transactions.forEach(t => {
    statusBreakdown[t.status] = (statusBreakdown[t.status] || 0) + 1;
    categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + t.amount;
  });
  
  return {
    totalAmount,
    transactionCount: transactions.length,
    averageAmount: transactions.length > 0 ? totalAmount / transactions.length : 0,
    statusBreakdown,
    categoryBreakdown,
  };
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  transactions: [],
  filters: {
    dateRange: { start: null, end: null },
    status: [],
    minAmount: null,
    maxAmount: null,
    categories: [],
    searchQuery: '',
  },
  stats: {
    totalAmount: 0,
    transactionCount: 0,
    averageAmount: 0,
    statusBreakdown: {},
    categoryBreakdown: {},
  },
  isLoading: false,
  
  setTransactions: (transactions) => {
    set({
      transactions: [...transactions],
      stats: calculateStats(transactions),
    });
  },
  
  setFilters: (newFilters) => {
    const filters = { ...get().filters, ...newFilters };
    set({ filters });
    
    const filtered = get().transactions.filter(t => {
      if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
      if (filters.minAmount !== null && t.amount < filters.minAmount) return false;
      if (filters.maxAmount !== null && t.amount > filters.maxAmount) return false;
      if (filters.categories.length > 0 && !filters.categories.includes(t.category)) return false;
      if (filters.searchQuery && !t.description.toLowerCase().includes(filters.searchQuery.toLowerCase())) return false;
      if (filters.dateRange.start && new Date(t.date) < filters.dateRange.start) return false;
      if (filters.dateRange.end && new Date(t.date) > filters.dateRange.end) return false;
      return true;
    });
    
    set({ stats: calculateStats(filtered) });
  },
  
  addTransaction: (transaction) => {
    const transactions = [...get().transactions, transaction];
    set({
      transactions,
      stats: calculateStats(transactions),
    });
  },
  
  updateTransaction: (id, updates) => {
    const transactions = get().transactions.map(t =>
      t.id === id ? { ...t, ...updates } : { ...t }
    );
    set({
      transactions,
      stats: calculateStats(transactions),
    });
  },
}));
