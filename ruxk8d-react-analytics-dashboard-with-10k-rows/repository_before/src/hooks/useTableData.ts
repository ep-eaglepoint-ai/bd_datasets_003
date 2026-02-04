import { useMemo } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { Transaction } from '../types';

export function useTableData() {
  const { transactions, filters } = useDashboardStore();
  
  const filteredData = useMemo(() => {
    return transactions.filter(t => {
      if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
      if (filters.minAmount !== null && t.amount < filters.minAmount) return false;
      if (filters.maxAmount !== null && t.amount > filters.maxAmount) return false;
      if (filters.categories.length > 0 && !filters.categories.includes(t.category)) return false;
      if (filters.searchQuery && !t.description.toLowerCase().includes(filters.searchQuery.toLowerCase())) return false;
      if (filters.dateRange.start && new Date(t.date) < filters.dateRange.start) return false;
      if (filters.dateRange.end && new Date(t.date) > filters.dateRange.end) return false;
      return true;
    });
  }, [transactions, filters]);
  
  return { data: filteredData, total: filteredData.length };
}
