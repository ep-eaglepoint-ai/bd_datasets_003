import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { Transaction, FilterState } from '../types';

interface DashboardState {
  transactions: Transaction[];
  filters: FilterState;
  isLoading: boolean;
  setTransactions: (transactions: Transaction[]) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
}

export const useDashboardStore = create<DashboardState>()(
  immer((set) => ({
    transactions: [],
    filters: {
      dateRange: { start: null, end: null },
      status: [],
      minAmount: null,
      maxAmount: null,
      categories: [],
      searchQuery: '',
    },
    isLoading: false,

    setTransactions: (transactions) => {
      set((state) => {
        state.transactions = transactions;
      });
    },

    setFilters: (newFilters) => {
      set((state: any) => {
        state.filters = { ...state.filters, ...newFilters };
      });
    },

    addTransaction: (transaction) => {
      set((state: any) => {
        state.transactions.push(transaction);
      });
    },

    updateTransaction: (id, updates) => {
      set((state: any) => {
        const index = state.transactions.findIndex((t: any) => t.id === id);
        if (index !== -1) {
          state.transactions[index] = { ...state.transactions[index], ...updates };
        }
      });
    },
  }))
);

export const useStats = () => {
  const transactions = useDashboardStore((state) => state.transactions);
  const filters = useDashboardStore((state) => state.filters);

  const filtered = filterTransactions(transactions, filters);

  const totalAmount = filtered.reduce((sum: number, t: Transaction) => sum + t.amount, 0);
  const statusBreakdown: Record<string, number> = {};
  const categoryBreakdown: Record<string, number> = {};

  filtered.forEach((t: Transaction) => {
    statusBreakdown[t.status] = (statusBreakdown[t.status] || 0) + 1;
    categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + t.amount;
  });

  return {
    filteredTransactions: filtered,
    stats: {
      totalAmount,
      transactionCount: filtered.length,
      averageAmount: filtered.length > 0 ? totalAmount / filtered.length : 0,
      statusBreakdown,
      categoryBreakdown,
    },
  };
};
