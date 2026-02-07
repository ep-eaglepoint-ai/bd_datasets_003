import React, { useState, useEffect } from 'react';
import { ColumnDef } from '../types';

const SEARCH_DEBOUNCE_MS = 300;

interface FilterBarProps {
  columns: ColumnDef[];
  onFilter: (column: string, value: string) => void;
  onSearch: (term: string) => void;
  searchTerm: string;
  isSearching?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  columns,
  onFilter,
  onSearch,
  searchTerm,
  isSearching = false,
}) => {
  const [displayValue, setDisplayValue] = useState(searchTerm);

  useEffect(() => {
    setDisplayValue(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    const id = setTimeout(() => {
      onSearch(displayValue);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [displayValue, onSearch]);

  const showSearchLoading = displayValue !== searchTerm || isSearching;

  return (
    <div className="filter-bar">
      <div className="search-box">
        <input
          type="text"
          placeholder="Search all columns..."
          value={displayValue}
          onChange={(e) => setDisplayValue(e.target.value)}
          aria-label="Search all columns"
        />
        {showSearchLoading && (
          <span className="filter-loading" aria-live="polite">
            Searching...
          </span>
        )}
      </div>
      <div className="column-filters">
        {columns
          .filter((col) => col.filterable)
          .map((column) => (
            <div key={column.id} className="filter-input">
              <label htmlFor={`filter-${column.id}`}>{column.header}</label>
              <input
                id={`filter-${column.id}`}
                type="text"
                placeholder={`Filter ${column.header}...`}
                onChange={(e) => onFilter(column.accessor, e.target.value)}
                aria-label={`Filter by ${column.header}`}
              />
            </div>
          ))}
      </div>
    </div>
  );
};
