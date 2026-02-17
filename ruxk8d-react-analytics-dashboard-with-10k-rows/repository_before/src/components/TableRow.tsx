import React from 'react';
import { flexRender, Row } from '@tanstack/react-table';
import { Transaction } from '../types';

interface TableRowProps {
  row: Row<Transaction>;
}

export function TableRow({ row }: TableRowProps) {
  return (
    <tr>
      {row.getVisibleCells().map(cell => (
        <td key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}
