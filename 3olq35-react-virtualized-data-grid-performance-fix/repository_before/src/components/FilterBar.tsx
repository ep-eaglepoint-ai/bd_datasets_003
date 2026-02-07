import React from 'react';
import { ColumnDef } from '../types';

interface FilterBarProps {
  columns: ColumnDef[];
  onFilter: (column: string, value: string) => void;
  onSearch: (term: string) => void;
  searchTerm: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  columns,
  onFilter,
  onSearch,
  searchTerm,
}) => {
  return (
    <div className="filter-bar">
      <div className="search-box">
        <input
          type="text"
          placeholder="Search all columns..."
          value={searchTerm}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div className="column-filters">
        {columns
          .filter(col => col.filterable)
          .map(column => (
            <div key={column.id} className="filter-input">
              <label>{column.header}</label>
              <input
                type="text"
                placeholder={`Filter ${column.header}...`}
                onChange={(e) => onFilter(column.accessor, e.target.value)}
              />
            </div>
          ))}
      </div>
    </div>
  );
};
