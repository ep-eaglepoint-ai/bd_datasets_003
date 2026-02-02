import React, { useState, useEffect } from 'react';
import { useDashboardStore } from '../store/dashboardStore';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export function Filters() {
  const filters = useDashboardStore(state => state.filters);
  const setFilters = useDashboardStore(state => state.setFilters);
  const transactions = useDashboardStore(state => state.transactions);

  const [searchInput, setSearchInput] = useState(filters.searchQuery);
  const debouncedSearch = useDebounce(searchInput, 300);

  const categories = React.useMemo(() => [...new Set(transactions.map(t => t.category))], [transactions]);
  const statuses = ['pending', 'completed', 'failed', 'refunded'];

  useEffect(() => {
    setFilters({ searchQuery: debouncedSearch });
  }, [debouncedSearch, setFilters]);

  const handleStatusChange = (status: string) => {
    const newStatuses = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [...filters.status, status];
    setFilters({ status: newStatuses });
  };

  const handleCategoryChange = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category];
    setFilters({ categories: newCategories });
  };

  const handleMinAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value ? parseFloat(e.target.value) : null;
    setFilters({ minAmount: value });
  };

  const handleMaxAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value ? parseFloat(e.target.value) : null;
    setFilters({ maxAmount: value });
  };


  return (
    <div className="filters-container">
      <div className="filter-group">
        <label>Search</label>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search transactions..."
        />
      </div>

      <div className="filter-group">
        <label>Status</label>
        <div className="checkbox-group">
          {statuses.map(status => (
            <label key={status}>
              <input
                type="checkbox"
                checked={filters.status.includes(status)}
                onChange={() => handleStatusChange(status)}
              />
              {status}
            </label>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label>Category</label>
        <div className="checkbox-group">
          {categories.map(category => (
            <label key={category}>
              <input
                type="checkbox"
                checked={filters.categories.includes(category)}
                onChange={() => handleCategoryChange(category)}
              />
              {category}
            </label>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label>Amount Range</label>
        <div className="range-inputs">
          <input
            type="number"
            placeholder="Min"
            onChange={handleMinAmountChange}
          />
          <input
            type="number"
            placeholder="Max"
            onChange={handleMaxAmountChange}
          />
        </div>
      </div>

    </div>
  );
}
