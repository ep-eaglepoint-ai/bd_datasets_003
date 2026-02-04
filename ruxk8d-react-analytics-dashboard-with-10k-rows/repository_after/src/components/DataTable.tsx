
import React, { useState, useMemo, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTableData } from '../hooks/useTableData';
import { TableRow } from './TableRow';
import { formatCurrency, formatDate } from '../utils/formatters';

export function DataTable() {
  const { data } = useTableData();
  const [sorting, setSorting] = useState<SortingState>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  // Requirement 3: Stable column definitions
  const columns = useMemo(() => [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: (info: any) => formatDate(info.getValue()),
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: (info: any) => formatCurrency(info.getValue()),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info: any) => (
        <span className={`status-badge status-${info.getValue()}`}>
          {info.getValue()}
        </span>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: 'merchant',
      header: 'Merchant',
      cell: (info: any) => info.getValue(),
    },
    {
      accessorKey: 'user',
      header: 'User',
      cell: (info: any) => info.getValue().name,
    },
  ], []);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  // Requirement 1: Row virtualization
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45, // Estimated row height
    overscan: 10,
  });

  return (
    <div
      className="table-container"
      ref={parentRef}
      style={{ height: '600px', overflow: 'auto' }}
    >
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'white' }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: 'pointer', padding: '12px', borderBottom: '2px solid #eee', textAlign: 'left' }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' ? ' ↑' : ''}
                    {header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <TableRow
                  key={row.id}
                  row={row}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
