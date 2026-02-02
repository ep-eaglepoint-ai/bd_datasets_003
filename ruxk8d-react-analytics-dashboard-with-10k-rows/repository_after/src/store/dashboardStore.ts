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
