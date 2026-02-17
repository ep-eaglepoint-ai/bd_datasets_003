
import { Transaction, FilterState } from '../types';

export const filterTransactions = (transactions: Transaction[], filters: FilterState): Transaction[] => {
    console.log('Filtering logic executing...');
    return transactions.filter((t) => {
        if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
        if (filters.minAmount !== null && t.amount < filters.minAmount) return false;
        if (filters.maxAmount !== null && t.amount > filters.maxAmount) return false;
        if (filters.categories.length > 0 && !filters.categories.includes(t.category)) return false;
        if (filters.searchQuery) {
            if (!t.description.toLowerCase().includes(filters.searchQuery.toLowerCase())) return false;
        }
        if (filters.dateRange.start && new Date(t.date) < filters.dateRange.start) return false;
        if (filters.dateRange.end && new Date(t.date) > filters.dateRange.end) return false;
        return true;
    });
};
