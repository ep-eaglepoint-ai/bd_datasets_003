import React, { useRef } from 'react';
import { ColumnDef, SortState } from '../types';

interface GridHeaderProps {
  columns: ColumnDef[];
  columnWidths: Record<string, number>;
  sort: SortState | null;
  onSort: (columnId: string) => void;
  onColumnResize: (columnId: string, width: number) => void;
  allSelected: boolean;
  onSelectAll: () => void;
  isSorting?: boolean;
}

export const GridHeader: React.FC<GridHeaderProps> = ({
  columns,
  columnWidths,
  sort,
  onSort,
  onColumnResize,
  allSelected,
  onSelectAll,
  isSorting = false,
}) => {
  const rafIdRef = useRef<number | null>(null);
  const latestClientXRef = useRef(0);

  const handleResizeStart = (columnId: string, startX: number, startWidth: number) => {
    const handleMouseMove = (e: MouseEvent) => {
      latestClientXRef.current = e.clientX;
      if (rafIdRef.current == null) {
        rafIdRef.current = requestAnimationFrame(() => {
          const newWidth = Math.max(
            50,
            startWidth + (latestClientXRef.current - startX)
          );
          onColumnResize(columnId, newWidth);
          rafIdRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <thead>
      <tr role="row">
        {columns.map((column, colIndex) => (
          <th
            key={column.id}
            role="columnheader"
            style={{ width: columnWidths[column.id] }}
            className={`grid-header-cell ${sort?.column === column.id ? 'sorted' : ''}`}
            aria-sort={
              sort?.column === column.id
                ? sort.direction === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined
            }
            aria-colindex={colIndex + 1}
          >
            {column.id === 'select' ? (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
                aria-label="Select all rows"
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
                {isSorting && sort?.column === column.id && (
                  <span className="sort-loading" aria-live="polite">
                    Sorting...
                  </span>
                )}
                <div
                  className="resize-handle"
                  onMouseDown={(e) =>
                    handleResizeStart(column.id, e.clientX, columnWidths[column.id])
                  }
                />
              </>
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
};
