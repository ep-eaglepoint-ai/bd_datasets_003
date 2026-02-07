import React from 'react';
import { ColumnDef } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';

interface GridCellProps {
  column: ColumnDef;
  value: string | number;
}

export const GridCell: React.FC<GridCellProps> = ({ column, value }) => {
  const formatValue = () => {
    switch (column.accessor) {
      case 'date':
        return formatDate(value as string);
      case 'price':
      case 'total':
        return formatCurrency(value as number);
      case 'type':
        return <span className={`type-badge ${value}`}>{value}</span>;
      case 'status':
        return <span className={`status-badge ${value}`}>{value}</span>;
      default:
        return value;
    }
  };

  return <div className="grid-cell">{formatValue()}</div>;
};
