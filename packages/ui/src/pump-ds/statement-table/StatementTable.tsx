import React, { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

/**
 * A column of a StatementTable. `align: 'right'` also renders the cells in
 * mono — a numeric column reads as one, and the digits line up.
 */
export interface StatementColumn<T> {
  header: ReactNode;
  /** Cell content for a row. Return a plain string for a plain cell. */
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Emphasise the column (the figure the row is about). */
  strong?: boolean;
  /** Fraction of the table width; defaults to an equal share. */
  width?: string;
}

export interface StatementTableProps<T> {
  columns: StatementColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /**
   * A closing row, cell by cell (same order as `columns`). Pass the figure the
   * rows explain — never a second, re-derived one.
   */
  total?: ReactNode[];
  /** Shown instead of the table when there are no rows. Omit to render nothing. */
  emptyMessage?: string;
  className?: string;
}

const cellClass = (col: { align?: 'left' | 'right'; strong?: boolean }) =>
  cn(
    'px-2 py-1 align-top',
    col.align === 'right' ? 'text-right font-mono tabular-nums' : 'text-left',
    col.strong && 'font-semibold',
  );

/**
 * StatementTable — the compact, read-only table a report statement is made of.
 *
 * Statements are dense and printed as often as they are read, so this mirrors
 * the PDF's table: small type, right-aligned mono numerics, a quiet header rule
 * and an optional total row. It is deliberately not the sortable, filterable
 * `DataTable` — nothing here is interactive, and a sort control on a statement
 * invites an operator to reorder figures that are ordered for a reason.
 */
export function StatementTable<T>({
  columns,
  rows,
  rowKey,
  total,
  emptyMessage,
  className,
}: StatementTableProps<T>) {
  if (rows.length === 0) {
    return emptyMessage ? (
      <div className="px-2 py-1.5 text-[11px] text-ink-faint">{emptyMessage}</div>
    ) : null;
  }

  return (
    <table className={cn('w-full border-collapse text-[11px] text-ink-default', className)}>
      <thead>
        <tr className="border-b border-border-soft text-[10px] uppercase tracking-[0.04em] text-ink-faint">
          {columns.map((col, i) => (
            <th
              key={i}
              scope="col"
              className={cn(cellClass({ align: col.align }), 'font-medium')}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowKey(row, rowIndex)} className="border-b border-border-soft/60 last:border-0">
            {columns.map((col, i) => (
              <td key={i} className={cellClass(col)}>
                {col.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {total && (
        <tfoot>
          <tr className="border-t border-border-strong font-semibold text-ink-strong">
            {columns.map((col, i) => (
              <td key={i} className={cellClass(col)}>
                {total[i]}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
