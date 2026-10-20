import React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { useRunTask } from '../../utils/runTask.js';
import { DataSection } from '../../pump-ds/data-section/index.js';
import { cn } from '../../pump-ds/lib/cn.js';

/** Header type for a column without meta; a kind-styled column's meta overrides it. */
const HEADER_CLASS = 'text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-muted';

declare module '@tanstack/react-table' {
  /**
   * Optional per-column presentation, set by the pump-ds `InteractiveTable`
   * adapter from a column's kind (alignment, mono). A column without it
   * renders as before.
   */
  // oxlint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Body and total cells. */
    className?: string;
    /** Header cell, merged over the default header type; falls back to `className`. */
    headerClassName?: string;
    width?: string;
  }
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[] | undefined;
  isLoading?: boolean;
  /** The query's error. An access refusal (403 / access policy) shows its message, no Retry. */
  error?: Error | null;
  /** Re-runs the failed query (usually the query's `refetch`). Adds Retry to the error. */
  onRetry?: () => unknown;
  /** Names the data in the error and loading label ("Couldn't load <title>"). */
  title?: string;
  /** Loading skeleton height (px); match the table at rest. */
  placeholderHeight?: number;
  /** Message shown when there is no data (and no error/loading). */
  emptyMessage?: string;
  onRowClick?: (row: T) => void | Promise<unknown>;
  /** Stable row key extractor; defaults to the row index. */
  getRowId?: (row: T, index: number) => string;
  initialSorting?: SortingState;
  /** Drop the outer border / radius / surface so it sits flush inside a Panel. */
  bare?: boolean;
  /** Highlight (and scroll into view) the row whose id matches. Used by deep-links. */
  highlightRowId?: string | null;
  /**
   * The row the screen is showing the detail of (a picked day): marked
   * `aria-current` and tinted like a highlight, without scrolling to it.
   */
  selectedRowId?: string | null;
  /** Tighter cell padding so wide tables fit without horizontal scroll. */
  dense?: boolean;
  /** Rows a save just updated, tinted for a moment (#606, `useFlashingRows`). */
  flashRowIds?: ReadonlySet<string>;
  /**
   * With `onRowClick`: names each row ("Cash in Hand entries") and makes it
   * reachable by Tab and opened by Enter or Space. Opt-in, so tables without it
   * keep their tab order.
   */
  rowLabel?: (row: T) => string;
}

/**
 * Dense, sortable table built on TanStack Table. Its loading / error (with
 * Retry) / access-refusal / empty states come from the shared `DataSection`
 * (bare shape). Replaces the hand-rolled `<table>`/styled-div lists that each
 * screen re-implemented. Designed for real operational data density (12–13px).
 */
export function DataTable<T>({
  columns,
  data,
  isLoading,
  error,
  onRetry,
  title = 'records',
  placeholderHeight = 160,
  emptyMessage = 'No records found.',
  onRowClick,
  getRowId,
  initialSorting,
  bare = false,
  highlightRowId,
  selectedRowId,
  dense = false,
  rowLabel,
  flashRowIds,
}: DataTableProps<T>) {
  const cellPad = dense ? '6px 6px' : '9px 12px';
  const runTask = useRunTask();
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

  // Render a totals row only when some column defines a footer.
  const hasFooter = columns.some((c) => c.footer != null);

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

  return (
    <div style={{ ...wrap, overflowX: 'auto' }}>
      <DataSection
        shape="bare"
        title={title}
        query={{
          isPending: !!isLoading,
          fetchStatus: isLoading ? 'fetching' : 'idle',
          isError: !!error,
          error,
          refetch: onRetry,
        }}
        placeholderHeight={placeholderHeight}
        isEmpty={!data || data.length === 0}
        empty={<div style={stateBox}>{emptyMessage}</div>}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                style={{ borderBottom: '1px solid var(--border-strong)', textAlign: 'left' }}
              >
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const meta = header.column.columnDef.meta ?? {};
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn(HEADER_CLASS, meta.headerClassName ?? meta.className)}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : undefined
                      }
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      style={{
                        padding: cellPad,
                        cursor: canSort ? 'pointer' : 'default',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                        width: meta.width,
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
              const isSelected = selectedRowId != null && row.id === selectedRowId;
              const isFlashing = !!flashRowIds?.has(row.id) && !isHighlighted && !isSelected;
              return (
                <tr
                  key={row.id}
                  aria-current={isSelected ? 'true' : undefined}
                  data-flash={isFlashing ? 'true' : undefined}
                  onClick={
                    onRowClick
                      ? () => runTask(onRowClick(row.original), 'Could not open that row.')
                      : undefined
                  }
                  {...(onRowClick && rowLabel
                    ? {
                        tabIndex: 0,
                        'aria-label': rowLabel(row.original),
                        className: cn(
                          'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
                          isFlashing && 'bg-success-bg',
                        ),
                        onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          runTask(onRowClick(row.original), 'Could not open that row.');
                        },
                      }
                    : isFlashing
                      ? { className: 'bg-success-bg' }
                      : {})}
                  ref={(el) => {
                    if (el && isHighlighted && scrolledToRef.current !== row.id) {
                      scrolledToRef.current = row.id;
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  style={{
                    borderBottom: '1px solid var(--border-soft)',
                    cursor: onRowClick ? 'pointer' : 'default',
                    backgroundColor:
                      isHighlighted || isSelected ? 'var(--state-info-bg)' : undefined,
                    boxShadow:
                      isHighlighted || isSelected
                        ? 'inset 2px 0 0 var(--state-info-fg)'
                        : undefined,
                    transition: 'background-color 0.4s ease',
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cell.column.columnDef.meta?.className}
                      style={{
                        padding: cellPad,
                        color: 'var(--text-default)',
                        verticalAlign: 'middle',
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {hasFooter && (
            <tfoot>
              {table.getFooterGroups().map((fg) => (
                <tr
                  key={fg.id}
                  className="border-t border-border-strong font-semibold text-ink-strong"
                >
                  {fg.headers.map((header, i) => {
                    const Cell = i === 0 ? 'th' : 'td';
                    const className = header.column.columnDef.meta?.className;
                    return (
                      <Cell
                        key={header.id}
                        scope={i === 0 ? 'row' : undefined}
                        // A kind-styled column aligns its total like its cells.
                        className={cn(
                          dense ? 'px-1.5 py-1.5' : 'px-3 py-[9px]',
                          className ?? 'text-left',
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.footer, header.getContext())}
                      </Cell>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </DataSection>
    </div>
  );
}
