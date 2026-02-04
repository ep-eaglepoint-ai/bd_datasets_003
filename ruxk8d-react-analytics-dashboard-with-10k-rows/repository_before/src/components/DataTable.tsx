import React, { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  SortingState,
} from '@tanstack/react-table';
import { useTableData } from '../hooks/useTableData';
import { Transaction } from '../types';
import { TableRow } from './TableRow';
import { formatCurrency, formatDate } from '../utils/formatters';

export function DataTable() {
  const { data } = useTableData();
  const [sorting, setSorting] = useState<SortingState>([]);
  
  const columns = [
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
  ];
  
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  
  return (
    <div className="table-container">
      <table>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{ cursor: 'pointer' }}
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
          {table.getRowModel().rows.map(row => (
            <TableRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
