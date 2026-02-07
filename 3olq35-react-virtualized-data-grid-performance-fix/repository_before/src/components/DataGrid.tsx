import React, { useState } from 'react';
import { Transaction, ColumnDef, FilterState, SortState } from '../types';
import { GridHeader } from './GridHeader';
import { GridRow } from './GridRow';
import { FilterBar } from './FilterBar';
import { formatCurrency, formatDate } from '../utils/formatters';

interface DataGridProps {
  data: Transaction[];
  onLoadMore?: () => void;
}

const columns: ColumnDef[] = [
  { id: 'select', header: '', accessor: 'id', width: 40, sortable: false, filterable: false },
  { id: 'date', header: 'Date', accessor: 'date', width: 120, sortable: true, filterable: true },
  { id: 'symbol', header: 'Symbol', accessor: 'symbol', width: 100, sortable: true, filterable: true },
  { id: 'type', header: 'Type', accessor: 'type', width: 80, sortable: true, filterable: true },
  { id: 'quantity', header: 'Quantity', accessor: 'quantity', width: 100, sortable: true, filterable: false },
  { id: 'price', header: 'Price', accessor: 'price', width: 100, sortable: true, filterable: false },
  { id: 'total', header: 'Total', accessor: 'total', width: 120, sortable: true, filterable: false },
  { id: 'status', header: 'Status', accessor: 'status', width: 100, sortable: true, filterable: true },
  { id: 'account', header: 'Account', accessor: 'account', width: 120, sortable: true, filterable: true },
  { id: 'broker', header: 'Broker', accessor: 'broker', width: 120, sortable: true, filterable: true },
];

export const DataGrid: React.FC<DataGridProps> = ({ data, onLoadMore: _onLoadMore }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState[]>([]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    columns.reduce((acc, col) => ({ ...acc, [col.id]: col.width }), {})
  );
  const [searchTerm, setSearchTerm] = useState('');

  const handleSelectRow = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredData.map(row => row.id)));
    }
  };

  const handleSort = (columnId: string) => {
    if (sort?.column === columnId) {
      setSort({ column: columnId, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ column: columnId, direction: 'asc' });
    }
  };

  const handleFilter = (column: string, value: string) => {
    setFilters(prev => {
      const existing = prev.find(f => f.column === column);
      if (existing) {
        if (value === '') {
          return prev.filter(f => f.column !== column);
        }
        return prev.map(f => f.column === column ? { ...f, value } : f);
      }
      return [...prev, { column, value }];
    });
  };

  const handleColumnResize = (columnId: string, width: number) => {
    setColumnWidths(prev => ({ ...prev, [columnId]: width }));
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  let filteredData = data;

  if (searchTerm) {
    filteredData = filteredData.filter(row =>
      Object.values(row).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }

  filters.forEach(filter => {
    filteredData = filteredData.filter(row =>
      String(row[filter.column as keyof Transaction])
        .toLowerCase()
        .includes(filter.value.toLowerCase())
    );
  });

  if (sort) {
    filteredData = [...filteredData].sort((a, b) => {
      const aVal = a[sort.column as keyof Transaction];
      const bVal = b[sort.column as keyof Transaction];
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }

  return (
    <div className="data-grid">
      <FilterBar
        columns={columns}
        onFilter={handleFilter}
        onSearch={handleSearch}
        searchTerm={searchTerm}
      />
      <div className="grid-container">
        <table className="grid-table">
          <GridHeader
            columns={columns}
            columnWidths={columnWidths}
            sort={sort}
            onSort={handleSort}
            onColumnResize={handleColumnResize}
            allSelected={selectedIds.size === filteredData.length && filteredData.length > 0}
            onSelectAll={handleSelectAll}
          />
          <tbody>
            {filteredData.map(row => (
              <GridRow
                key={row.id}
                row={row}
                columns={columns}
                columnWidths={columnWidths}
                isSelected={selectedIds.has(row.id)}
                onSelect={handleSelectRow}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid-footer">
        <span>Showing {filteredData.length} of {data.length} transactions</span>
        <span>{selectedIds.size} selected</span>
      </div>
    </div>
  );
};
