import React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useRunTask } from '../../utils/runTask.js';
import { DataSection } from '../../pump-ds/data-section/index.js';

/**
 * Optional per-column presentation, set by the pump-ds `InteractiveTable`
 * adapter from a column's kind (alignment, mono). A column without it renders
 * as before.
 */
export interface DataTableColumnMeta {
  /** Body and total cells. */
  className?: string;
  /** Header cell; falls back to `className`. */
  headerClassName?: string;
  width?: string;
}

const metaOf = (columnDef: { meta?: unknown }): DataTableColumnMeta =>
  (columnDef.meta as DataTableColumnMeta | undefined) ?? {};

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
  /** Tighter cell padding so wide tables fit without horizontal scroll. */
  dense?: boolean;
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
  dense = false,
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
                  const meta = metaOf(header.column.columnDef);
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={meta.headerClassName ?? meta.className}
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
                        fontWeight: 600,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--text-muted)',
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
              return (
                <tr
                  key={row.id}
                  onClick={
                    onRowClick
                      ? () => runTask(onRowClick(row.original), 'Could not open that row.')
                      : undefined
                  }
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
                    <td
                      key={cell.id}
                      className={metaOf(cell.column.columnDef).className}
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
                <tr key={fg.id} style={{ borderTop: '1px solid var(--border-strong)' }}>
                  {fg.headers.map((header, i) => {
                    const Cell = i === 0 ? 'th' : 'td';
                    const { className } = metaOf(header.column.columnDef);
                    return (
                      <Cell
                        key={header.id}
                        scope={i === 0 ? 'row' : undefined}
                        className={className}
                        style={{
                          padding: cellPad,
                          fontWeight: 600,
                          // A kind-styled column aligns its total like its cells.
                          textAlign: className ? undefined : 'left',
                          color: 'var(--text-strong)',
                        }}
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
