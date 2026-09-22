import React, { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

/** A column of a StatementTable. */
export interface StatementColumn<T> {
  header: ReactNode;
  /** Cell content for a row. Return a plain string for a plain cell. */
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /**
   * Render the cells in mono so the digits line up. Defaults to on for a
   * right-aligned column — that is what right-alignment is nearly always for —
   * pass `false` for a right-aligned column of words.
   */
  mono?: boolean;
  /** Emphasise the column (the figure the row is about). */
  strong?: boolean;
  /** Fraction of the table width; defaults to an equal share. */
  width?: string;
}

type CellStyle = Pick<StatementColumn<unknown>, 'align' | 'mono' | 'strong'>;

export interface StatementTableProps<T> {
  columns: StatementColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /**
   * A closing row, cell by cell (same order as `columns`). Pass the figure the
   * rows explain — never a second, re-derived one.
   */
  total?: ReactNode[];
  /**
   * Accessible name for the table. A statement stacks several of these, and
   * "table" three times tells a screen-reader user nothing.
   */
  label?: string;
  /** Shown instead of the table when there are no rows. Omit to render nothing. */
  emptyMessage?: string;
  className?: string;
}

const cellClass = (col: CellStyle) =>
  cn(
    'px-2 py-1 align-top',
    col.align === 'right' ? 'text-right' : 'text-left',
    (col.mono ?? col.align === 'right') && 'font-mono tabular-nums',
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
  label,
  emptyMessage,
  className,
}: StatementTableProps<T>) {
  if (rows.length === 0) {
    return emptyMessage ? (
      <div className="px-2 py-1.5 text-[11px] text-ink-faint">{emptyMessage}</div>
    ) : null;
  }

  return (
    <table
      aria-label={label}
      className={cn('w-full border-collapse text-[11px] text-ink-default', className)}
    >
      <thead>
        <tr className="border-b border-border-soft text-[10px] uppercase tracking-[0.04em] text-ink-faint">
          {columns.map((col, i) => (
            <th
              key={i}
              scope="col"
              // The header is words even above a mono column.
              className={cn(cellClass({ align: col.align, mono: false }), 'font-medium')}
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
