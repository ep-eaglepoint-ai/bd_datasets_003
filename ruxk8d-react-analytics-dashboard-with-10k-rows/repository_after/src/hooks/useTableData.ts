
import { useMemo } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { filterTransactions } from '../utils/filtering';
import { Transaction } from '../types';

export function useFilteredData() {
  const transactions = useDashboardStore((state) => state.transactions);
  const filters = useDashboardStore((state) => state.filters);

  // Requirement 6: Single location for filtering logic execution
  const filteredData = useMemo(() => {
    return filterTransactions(transactions, filters);
  }, [transactions, filters]);

  return filteredData;
}

export function useTableData() {
  const filteredData = useFilteredData();
  return { data: filteredData, total: filteredData.length };
}

export function useStats() {
  const filtered = useFilteredData();

  const stats = useMemo(() => {
    const totalAmount = filtered.reduce((sum: number, t: Transaction) => sum + t.amount, 0);
    const statusBreakdown: Record<string, number> = {};
    const categoryBreakdown: Record<string, number> = {};

    filtered.forEach((t: Transaction) => {
      statusBreakdown[t.status] = (statusBreakdown[t.status] || 0) + 1;
      categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + t.amount;
    });

    return {
      totalAmount,
      transactionCount: filtered.length,
      averageAmount: filtered.length > 0 ? totalAmount / filtered.length : 0,
      statusBreakdown,
      categoryBreakdown,
    };
  }, [filtered]);

  return {
    filteredTransactions: filtered,
    stats,
  };
}
