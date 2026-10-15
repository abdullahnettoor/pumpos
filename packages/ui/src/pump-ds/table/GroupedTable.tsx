import React, { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import {
  columnClass,
  headerClass,
  kindClass,
  renderCell,
  totalCells,
  type TableColumn,
  type TotalRow,
} from './columns.js';

/** One group of rows under its own header row. */
export interface TableGroup<T> {
  key: string;
  /** The group's header row: a label, a status, an action. Spans every column. */
  header: ReactNode;
  rows: T[];
  /** Read the group's rows quieter (figures not in yet). */
  muted?: boolean;
  /** A save just updated this group: its header is tinted for a moment (#606). */
  flash?: boolean;
}

export interface GroupedTableProps<T> {
  /** The same column definitions `InteractiveTable` and `StatementTable` take. */
  columns: TableColumn<T>[];
  groups: TableGroup<T>[];
  rowKey: (row: T, index: number) => string;
  /** A closing row over every group's rows; see `TotalRow`. */
  totalRow?: TotalRow;
  /** Accessible name for the table. */
  label?: string;
  className?: string;
}

const CELL = 'px-3 py-[9px] align-middle';

/**
 * GroupedTable (#533) — a read-only working table whose rows fall into groups,
 * each under a full-width header row (a Drawer's nozzles under "DU1 · Ravi",
 * with its status and action). Same look and column kinds as
 * `InteractiveTable`, without sorting: sorting would break the groups apart.
 * The total row sums every group's rows.
 */
export function GroupedTable<T>({
  columns,
  groups,
  rowKey,
  totalRow,
  label,
  className,
}: GroupedTableProps<T>) {
  const all = groups.flatMap((g) => g.rows);
  const totals = all.length > 0 ? totalCells(columns, all, totalRow) : null;
  const firstFigure = totals ? totals.findIndex((cell, i) => i > 0 && cell !== '') : -1;
  const labelSpan = firstFigure > 0 ? firstFigure : 1;
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table aria-label={label} className="w-full border-collapse text-[13px] text-ink-default">
        <thead>
          <tr className="border-b border-border-strong">
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={cn(CELL, 'whitespace-nowrap', headerClass(col))}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.key} data-group={group.key}>
            <tr
              className={cn(
                'border-b border-border-soft transition-colors duration-500 motion-reduce:transition-none',
                group.flash ? 'bg-success-bg' : 'bg-surface-alt',
              )}
              data-flash={group.flash ? 'true' : undefined}
            >
              <th
                scope="colgroup"
                colSpan={columns.length}
                className="px-3 py-1.5 text-left text-[12px] font-medium text-ink-default"
              >
                {group.header}
              </th>
            </tr>
            {group.rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className={cn('border-b border-border-soft', group.muted && 'text-ink-muted')}
              >
                {columns.map((col) => (
                  <td key={col.id} className={cn(CELL, columnClass(col))}>
                    {renderCell(col, row, 'interactive')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
        {totals && (
          <tfoot>
            <tr className="border-t border-border-strong font-semibold text-ink-strong">
              {/* The label spans the leading columns that add nothing up, so a
                  label that names what it leaves out has room to read. */}
              <th
                scope="row"
                colSpan={labelSpan}
                className={cn(CELL, 'whitespace-nowrap text-left')}
              >
                {totals[0]}
              </th>
              {columns.slice(labelSpan).map((col, i) => (
                <td key={col.id} className={cn(CELL, kindClass(col))}>
                  {totals[i + labelSpan]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
