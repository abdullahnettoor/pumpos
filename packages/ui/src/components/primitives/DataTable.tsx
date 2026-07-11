import React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[] | undefined;
  isLoading?: boolean;
  error?: Error | null;
  /** Message shown when there is no data (and no error/loading). */
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  /** Stable row key extractor; defaults to the row index. */
  getRowId?: (row: T, index: number) => string;
  initialSorting?: SortingState;
  /** Drop the outer border / radius / surface so it sits flush inside a Panel. */
  bare?: boolean;
  /** Highlight (and scroll into view) the row whose id matches. Used by deep-links. */
  highlightRowId?: string | null;
}

/**
 * Dense, sortable table built on TanStack Table with built-in loading / empty /
 * error states. Replaces the hand-rolled `<table>`/styled-div lists that each
 * screen re-implemented. Designed for real operational data density (12–13px).
 */
export function DataTable<T>({
  columns,
  data,
  isLoading,
  error,
  emptyMessage = 'No records found.',
  onRowClick,
  getRowId,
  initialSorting,
  bare = false,
  highlightRowId,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting ?? []);
  const scrolledToRef = React.useRef<string | null>(null);

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });

  const wrap: React.CSSProperties = bare
    ? { backgroundColor: 'transparent', overflow: 'hidden' }
    : {
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
      };
  const stateBox: React.CSSProperties = {
    padding: 'var(--space-8)',
    textAlign: 'center',
    fontSize: '13px',
    color: 'var(--text-muted)',
  };

  if (error) {
    return (
      <div style={wrap}>
        <div style={{ ...stateBox, color: 'var(--state-danger-fg)' }}>{error.message || 'Failed to load data.'}</div>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div style={wrap}>
        <div style={stateBox}>Loading…</div>
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div style={wrap}>
        <div style={stateBox}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div style={{ ...wrap, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} style={{ borderBottom: '1px solid var(--border-strong)', textAlign: 'left' }}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    style={{
                      padding: '8px 12px',
                      fontWeight: 600,
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--text-muted)',
                      cursor: canSort ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ''}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const isHighlighted = highlightRowId != null && row.id === highlightRowId;
            return (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                ref={(el) => {
                  if (el && isHighlighted && scrolledToRef.current !== row.id) {
                    scrolledToRef.current = row.id;
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                style={{
                  borderBottom: '1px solid var(--border-soft)',
                  cursor: onRowClick ? 'pointer' : 'default',
                  backgroundColor: isHighlighted ? 'var(--state-info-bg)' : undefined,
                  boxShadow: isHighlighted ? 'inset 2px 0 0 var(--state-info-fg)' : undefined,
                  transition: 'background-color 0.4s ease',
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={{ padding: '9px 12px', color: 'var(--text-default)', verticalAlign: 'middle' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
