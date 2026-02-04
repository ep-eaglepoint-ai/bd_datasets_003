
import React from 'react';
import { flexRender, Row } from '@tanstack/react-table';
import { Transaction } from '../types';

interface TableRowProps {
  row: Row<Transaction>;
  style?: React.CSSProperties;
}

// Requirement 4: Row components are wrapped in React.memo
export const TableRow = React.memo(({ row, style }: TableRowProps) => {
  return (
    <tr style={style}>
      {row.getVisibleCells().map(cell => (
        <td key={cell.id} style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to ensure it only re-renders if row data or style changes
  return (
    prevProps.row.id === nextProps.row.id &&
    prevProps.row.getIsSelected() === nextProps.row.getIsSelected() &&
    prevProps.row.original === nextProps.row.original &&
    prevProps.style?.transform === nextProps.style?.transform
  );
});

TableRow.displayName = 'TableRow';
