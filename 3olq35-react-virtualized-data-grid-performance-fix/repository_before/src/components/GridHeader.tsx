import React from 'react';
import { ColumnDef, SortState } from '../types';

interface GridHeaderProps {
  columns: ColumnDef[];
  columnWidths: Record<string, number>;
  sort: SortState | null;
  onSort: (columnId: string) => void;
  onColumnResize: (columnId: string, width: number) => void;
  allSelected: boolean;
  onSelectAll: () => void;
}

export const GridHeader: React.FC<GridHeaderProps> = ({
  columns,
  columnWidths,
  sort,
  onSort,
  onColumnResize,
  allSelected,
  onSelectAll,
}) => {
  const handleResizeStart = (columnId: string, startX: number, startWidth: number) => {
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(50, startWidth + (e.clientX - startX));
      onColumnResize(columnId, newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <thead>
      <tr>
        {columns.map(column => (
          <th
            key={column.id}
            style={{ width: columnWidths[column.id] }}
            className={`grid-header-cell ${sort?.column === column.id ? 'sorted' : ''}`}
          >
            {column.id === 'select' ? (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
              />
            ) : (
              <>
                <span
                  className="header-content"
                  onClick={() => column.sortable && onSort(column.id)}
                >
                  {column.header}
                  {sort?.column === column.id && (
                    <span className="sort-indicator">
                      {sort.direction === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </span>
                <div
                  className="resize-handle"
                  onMouseDown={(e) => handleResizeStart(column.id, e.clientX, columnWidths[column.id])}
                />
              </>
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
};
