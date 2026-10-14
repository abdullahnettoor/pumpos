import React from 'react';
import { cn } from '../lib/cn.js';
import {
  columnClass,
  headerClass,
  kindClass,
  renderCell,
  totalCells,
  type TableColumn,
  type TotalRow,
} from '../table/columns.js';

export interface StatementTableProps<T> {
  /** The same column definitions `InteractiveTable` takes. */
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** A closing row; see `TotalRow`. Pass `values` for the figure the rows explain. */
  totalRow?: TotalRow;
  /**
   * Accessible name for the table. A statement stacks several of these, and
   * "table" three times tells a screen-reader user nothing.
   */
  label?: string;
  /** Shown instead of the table when there are no rows. Omit to render nothing. */
  emptyMessage?: string;
  className?: string;
}

const CELL_PAD = 'px-2 py-1 align-top';

/**
 * StatementTable — the compact, read-only table a report statement is made of.
 *
 * Statements are dense and printed as often as they are read, so this mirrors
 * the PDF's table: small type, right-aligned mono numerics, a quiet header rule
 * and an optional total row. No hover, no zebra, no sort: a sort control on a
 * statement invites an operator to reorder figures that are ordered for a
 * reason. Status prints as an outline chip (ink and a rule, no fill), so it
 * survives a printer that drops backgrounds.
 */
export function StatementTable<T>({
  columns,
  rows,
  rowKey,
  totalRow,
  label,
  emptyMessage,
  className,
}: StatementTableProps<T>) {
  if (rows.length === 0) {
    return emptyMessage ? (
      <div className="px-2 py-1.5 text-[11px] text-ink-faint">{emptyMessage}</div>
    ) : null;
  }
  const totals = totalCells(columns, rows, totalRow);

  return (
    <table
      aria-label={label}
      className={cn('w-full border-collapse text-[11px] text-ink-default', className)}
    >
      <thead>
        <tr className="border-b border-border-soft">
          {columns.map((col) => (
            <th
              key={col.id}
              scope="col"
              className={cn(CELL_PAD, headerClass(col))}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr
            key={rowKey(row, rowIndex)}
            className="border-b border-border-soft/60 last:border-0 print:break-inside-avoid"
          >
            {columns.map((col) => (
              <td key={col.id} className={cn(CELL_PAD, columnClass(col))}>
                {renderCell(col, row, 'statement')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totals && (
        <tfoot>
          <tr className="border-t border-border-strong font-semibold text-ink-strong print:break-inside-avoid">
            {columns.map((col, i) =>
              i === 0 ? (
                <th key={col.id} scope="row" className={cn(CELL_PAD, kindClass(col))}>
                  {totals[i]}
                </th>
              ) : (
                <td key={col.id} className={cn(CELL_PAD, kindClass(col))}>
                  {totals[i]}
                </td>
              ),
            )}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
