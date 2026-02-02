
import { useMemo } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { filterTransactions } from '../utils/filtering';

export function useTableData() {
  const transactions = useDashboardStore((state) => state.transactions);
  const filters = useDashboardStore((state) => state.filters);

  // Requirement 6: Single location for filtering logic
  const filteredData = useMemo(() => {
    return filterTransactions(transactions, filters);
  }, [transactions, filters]);

  return { data: filteredData, total: filteredData.length };
}
