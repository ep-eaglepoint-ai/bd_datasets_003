import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
  useEffect,
  startTransition,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Transaction, ColumnDef, FilterState, SortState } from '../types';
import { GridHeader } from './GridHeader';
import { GridRow } from './GridRow';
import { FilterBar } from './FilterBar';

interface DataGridProps {
  data: Transaction[];
  onLoadMore?: () => void;
}

const ROW_HEIGHT = 40;
const OVERSCAN = 8;

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

export const DataGrid: React.FC<DataGridProps> = ({ data, onLoadMore }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState[]>([]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => columns.reduce((acc, col) => ({ ...acc, [col.id]: col.width }), {})
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [isSorting, setIsSorting] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const loadMoreRequestedRef = useRef(false);
  const dataLengthRef = useRef(data.length);

  const filteredData = useMemo(() => {
    let result = data;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((row) =>
        Object.values(row).some((val) =>
          String(val).toLowerCase().includes(term)
        )
      );
    }

    filters.forEach((filter) => {
      result = result.filter((row) =>
        String(row[filter.column as keyof Transaction])
          .toLowerCase()
          .includes(filter.value.toLowerCase())
      );
    });

    if (sort) {
      result = [...result].sort((a, b) => {
        const aVal = a[sort.column as keyof Transaction];
        const bVal = b[sort.column as keyof Transaction];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sort.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, searchTerm, filters, sort]);

  const rowVirtualizer = useVirtualizer({
    count: filteredData.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const handleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredData.length && filteredData.length > 0) {
        return new Set<string>();
      }
      return new Set(filteredData.map((row) => row.id));
    });
  }, [filteredData]);

  const handleSort = useCallback((columnId: string) => {
    if (scrollContainerRef.current) {
      pendingScrollRestoreRef.current = scrollContainerRef.current.scrollTop;
    }
    setIsSorting(true);
    startTransition(() => {
      setSort((prev) => {
        if (prev?.column === columnId) {
          return { column: columnId, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        }
        return { column: columnId, direction: 'asc' as const };
      });
    });
  }, []);

  const handleFilter = useCallback((column: string, value: string) => {
    if (scrollContainerRef.current) {
      pendingScrollRestoreRef.current = scrollContainerRef.current.scrollTop;
    }
    setFilters((prev) => {
      const existing = prev.find((f) => f.column === column);
      if (existing) {
        if (value === '') return prev.filter((f) => f.column !== column);
        return prev.map((f) => (f.column === column ? { ...f, value } : f));
      }
      return [...prev, { column, value }];
    });
  }, []);

  const handleColumnResize = useCallback((columnId: string, width: number) => {
    setColumnWidths((prev) => ({ ...prev, [columnId]: width }));
  }, []);

  const handleSearch = useCallback((term: string) => {
    if (scrollContainerRef.current) {
      pendingScrollRestoreRef.current = scrollContainerRef.current.scrollTop;
    }
    setSearchTerm(term);
  }, []);

  useEffect(() => {
    if (isSorting) {
      const id = requestAnimationFrame(() => setIsSorting(false));
      return () => cancelAnimationFrame(id);
    }
  }, [isSorting, sort]);

  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (pending !== null && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      const maxScroll = totalSize - el.clientHeight;
      el.scrollTop = Math.min(pending, Math.max(0, maxScroll));
      pendingScrollRestoreRef.current = null;
    }
  }, [filteredData.length, totalSize]);

  useEffect(() => {
    const lastIndex = virtualItems[virtualItems.length - 1]?.index;
    const size = filteredData.length;
    if (
      onLoadMore &&
      size > 0 &&
      lastIndex != null &&
      lastIndex >= size - 10 &&
      !loadMoreRequestedRef.current
    ) {
      loadMoreRequestedRef.current = true;
      onLoadMore();
    }
  }, [virtualItems, filteredData.length, onLoadMore]);

  useEffect(() => {
    if (data.length > dataLengthRef.current) {
      loadMoreRequestedRef.current = false;
    }
    dataLengthRef.current = data.length;
  }, [data.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const count = filteredData.length;
      if (count === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedRowIndex((i) => Math.min(i + 1, count - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedRowIndex((i) => Math.max(i - 1, 0));
          break;
        case 'PageDown':
          e.preventDefault();
          setFocusedRowIndex((i) => Math.min(i + 10, count - 1));
          break;
        case 'PageUp':
          e.preventDefault();
          setFocusedRowIndex((i) => Math.max(i - 10, 0));
          break;
        default:
          return;
      }
    },
    [filteredData.length]
  );

  useEffect(() => {
    setFocusedRowIndex((i) =>
      Math.min(i, Math.max(0, filteredData.length - 1))
    );
  }, [filteredData.length]);

  useEffect(() => {
    if (filteredData.length > 0) {
      rowVirtualizer.scrollToIndex(focusedRowIndex, {
        align: 'auto',
        behavior: 'smooth',
      });
    }
  }, [focusedRowIndex, filteredData.length, rowVirtualizer]);

  const allSelected =
    selectedIds.size === filteredData.length && filteredData.length > 0;

  return (
    <div className="data-grid">
      <FilterBar
        columns={columns}
        onFilter={handleFilter}
        onSearch={handleSearch}
        searchTerm={searchTerm}
        isSearching={false}
      />
      <div
        ref={scrollContainerRef}
        className="grid-container"
        role="grid"
        aria-label="Trading transactions"
        aria-rowcount={filteredData.length}
        aria-colcount={columns.length}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <table className="grid-table">
          <GridHeader
            columns={columns}
            columnWidths={columnWidths}
            sort={sort}
            onSort={handleSort}
            onColumnResize={handleColumnResize}
            allSelected={allSelected}
            onSelectAll={handleSelectAll}
            isSorting={isSorting}
          />
          <tbody>
            {virtualItems.length > 0 && virtualItems[0].start > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={columns.length}
                  style={{
                    height: virtualItems[0].start,
                    padding: 0,
                    border: 0,
                    lineHeight: 0,
                    verticalAlign: 'top',
                  }}
                />
              </tr>
            )}
            {virtualItems.map((virtualRow) => {
              const row = filteredData[virtualRow.index];
              return (
                <GridRow
                  key={row.id}
                  row={row}
                  columns={columns}
                  columnWidths={columnWidths}
                  isSelected={selectedIds.has(row.id)}
                  onSelect={handleSelectRow}
                  ariaRowIndex={virtualRow.index + 1}
                />
              );
            })}
            {virtualItems.length > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={columns.length}
                  style={{
                    height:
                      totalSize -
                      (virtualItems[virtualItems.length - 1]?.end ?? 0),
                    padding: 0,
                    border: 0,
                    lineHeight: 0,
                    verticalAlign: 'top',
                  }}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid-footer">
        <span>
          Showing {filteredData.length} of {data.length} transactions
        </span>
        <span>{selectedIds.size} selected</span>
      </div>
    </div>
  );
};
