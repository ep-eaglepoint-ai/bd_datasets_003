import React from 'react';
import { Transaction, ColumnDef } from '../types';
import { GridCell } from './GridCell';

interface GridRowProps {
  row: Transaction;
  columns: ColumnDef[];
  columnWidths: Record<string, number>;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export const GridRow: React.FC<GridRowProps> = ({
  row,
  columns,
  columnWidths,
  isSelected,
  onSelect,
}) => {
  return (
    <tr className={`grid-row ${isSelected ? 'selected' : ''}`}>
      {columns.map(column => (
        <td key={column.id} style={{ width: columnWidths[column.id] }}>
          {column.id === 'select' ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onSelect(row.id)}
            />
          ) : (
            <GridCell column={column} value={row[column.accessor]} />
          )}
        </td>
      ))}
    </tr>
  );
};
