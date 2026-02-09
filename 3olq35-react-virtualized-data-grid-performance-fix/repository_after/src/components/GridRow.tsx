import React from 'react';
import { Transaction, ColumnDef } from '../types';
import { GridCell } from './GridCell';

interface GridRowProps {
  row: Transaction;
  columns: ColumnDef[];
  columnWidths: Record<string, number>;
  isSelected: boolean;
  onSelect: (id: string) => void;
  ariaRowIndex?: number;
}

const GridRowComponent: React.FC<GridRowProps> = ({
  row,
  columns,
  columnWidths,
  isSelected,
  onSelect,
  ariaRowIndex,
}) => {
  return (
    <tr
      className={`grid-row ${isSelected ? 'selected' : ''}`}
      role="row"
      aria-rowindex={ariaRowIndex}
    >
      {columns.map((column, colIndex) => (
        <td
          key={column.id}
          role="gridcell"
          style={{ width: columnWidths[column.id] }}
          aria-colindex={colIndex + 1}
        >
          {column.id === 'select' ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onSelect(row.id)}
              aria-label={`Select row ${row.id}`}
            />
          ) : (
            <GridCell column={column} value={row[column.accessor]} />
          )}
        </td>
      ))}
    </tr>
  );
};

export const GridRow = React.memo(GridRowComponent);
