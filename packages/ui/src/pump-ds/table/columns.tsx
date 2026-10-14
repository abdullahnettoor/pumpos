import React, { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { StatusChip } from '../chip/StatusChip.js';
import type { PumpStatus } from '../chip/status-map.js';
import { formatDate, formatMoney, formatQuantity } from '../../utils/format.js';

interface ColumnBase<T> {
  /** Stable id; keys a figure passed to `totalRow.values`. */
  id: string;
  header: string;
  /**
   * Render the cell yourself (a link, a coloured figure). The kind still sets
   * the alignment and font; `value` still drives sorting and the total.
   */
  cell?: (row: T) => ReactNode;
  /** The figure the row is about, set in semibold. */
  emphasis?: boolean;
  /** Fraction of the table width (`'16%'`); defaults to an equal share. */
  width?: string;
}

type Amount = number | string | null | undefined;

export interface MoneyColumn<T> extends ColumnBase<T> {
  kind: 'money';
  /** `null` prints a blank cell (an entry that moved no money this way), not `₹0.00`. */
  value: (row: T) => Amount;
  /** Add the column up in the total row. On by default; off for a rate or a balance. */
  total?: boolean;
}

export interface QtyColumn<T> extends ColumnBase<T> {
  kind: 'qty';
  value: (row: T) => Amount;
  /** The unit (`'L'`, `'Nos'`), fixed or per row. Its decimals come with it. */
  unit?: string | ((row: T) => string | null | undefined);
  /** Override the unit's decimals (a meter reading carries 3). */
  decimals?: number;
  /** Add the column up in the total row. On by default; a mixed-unit column totals `—`. */
  total?: boolean;
}

export interface DateColumn<T> extends ColumnBase<T> {
  kind: 'date';
  value: (row: T) => string | Date | null | undefined;
}

export interface TextColumn<T> extends ColumnBase<T> {
  kind: 'text';
  value: (row: T) => string | number | null | undefined;
}

export interface StatusColumn<T> extends ColumnBase<T> {
  kind: 'status';
  value: (row: T) => PumpStatus;
}

/**
 * A column of a table. One definition renders in both adapters: the
 * interactive `InteractiveTable` and the read-only `StatementTable`.
 */
export type TableColumn<T> =
  MoneyColumn<T> | QtyColumn<T> | DateColumn<T> | TextColumn<T> | StatusColumn<T>;

/**
 * The closing row. `true` sums every money and qty column under a "Total"
 * label. Pass `values` to print a figure the rows explain (the server's total)
 * instead of re-deriving it.
 */
export type TotalRow = boolean | { label?: string; values?: Record<string, Amount> };

/** Which adapter is rendering; a statement prints, so its status is ink, not a fill. */
export type TableMode = 'interactive' | 'statement';

type Kind = TableColumn<unknown>['kind'];
type ColumnOf<K extends Kind, T> = Extract<TableColumn<T>, { kind: K }>;

/** How one kind of column reads. Every per-kind decision lives in `KINDS`. */
interface KindDef<K extends Kind> {
  /** Body and total cells. */
  className: string;
  /** Header cell: numbers sit over their figures in mono; every other header is a word. */
  headerClassName: string;
  /** The cell: the shared format, or the status vocabulary. */
  cell<T>(col: ColumnOf<K, T>, row: T, mode: TableMode): ReactNode;
  /** What the column sorts by; the raw value when absent. */
  sortValue?<T>(col: ColumnOf<K, T>, row: T): number | null;
  /** The column's total, formatted; absent when the kind does not add up. */
  total?<T>(col: ColumnOf<K, T>, rows: T[], given: Amount): string;
}

const NUMERIC = 'text-right font-mono tabular-nums';

const toNumber = (v: Amount): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const sum = <T,>(col: { value: (row: T) => Amount }, rows: T[]): number =>
  rows.reduce((acc, row) => acc + (toNumber(col.value(row)) ?? 0), 0);

const unitOf = <T,>(col: QtyColumn<T>, row: T): string | null | undefined =>
  typeof col.unit === 'function' ? col.unit(row) : col.unit;

const KINDS: { [K in Kind]: KindDef<K> } = {
  money: {
    className: NUMERIC,
    headerClassName: NUMERIC,
    cell: (col, row) => {
      const v = col.value(row);
      return v == null || v === '' ? '' : formatMoney(v);
    },
    sortValue: (col, row) => toNumber(col.value(row)),
    total: (col, rows, given) => formatMoney(given ?? sum(col, rows)),
  },
  qty: {
    className: NUMERIC,
    headerClassName: NUMERIC,
    cell: (col, row) =>
      formatQuantity(col.value(row), unitOf(col, row), { decimals: col.decimals }),
    sortValue: (col, row) => toNumber(col.value(row)),
    // Quantities are never added across units: a figure the caller passes
    // obeys the same rule as the sum.
    total: (col, rows, given) => {
      const units = new Set(rows.map((row) => unitOf(col, row) ?? ''));
      if (units.size > 1) return '—';
      const [unit] = units;
      return formatQuantity(given ?? sum(col, rows), unit, { decimals: col.decimals });
    },
  },
  // Dates sit in the sans face with aligned digits, as the Dashboard prints its times.
  date: {
    className: 'text-left tabular-nums',
    headerClassName: 'text-left',
    cell: (col, row) => formatDate(col.value(row)),
    sortValue: (col, row) => {
      const v = col.value(row);
      if (v == null || v === '') return null;
      const t = (v instanceof Date ? v : new Date(v)).getTime();
      return Number.isNaN(t) ? null : t;
    },
  },
  text: {
    className: 'text-left',
    headerClassName: 'text-left',
    cell: (col, row) => {
      const v = col.value(row);
      return v == null || v === '' ? '—' : String(v);
    },
  },
  status: {
    className: 'text-left',
    headerClassName: 'text-left',
    cell: (col, row, mode) =>
      mode === 'statement' ? (
        <StatusChip status={col.value(row)} size="xs" variant="outline" showIcon={false} />
      ) : (
        <StatusChip status={col.value(row)} size="xs" />
      ),
  },
};

/**
 * The definition for a column's kind. `KINDS[col.kind]` is the entry for `col`
 * by construction, but TypeScript cannot correlate the two, so this is the one
 * cast in the module.
 */
const kindOf = <T,>(col: TableColumn<T>): KindDef<Kind> => KINDS[col.kind] as KindDef<Kind>;

/** Whether the column adds up in a total row. */
const contributes = <T,>(col: TableColumn<T>): boolean =>
  (col.kind === 'money' || col.kind === 'qty') && col.total !== false;

/** Alignment and font for a column's body and total cells. */
export const kindClass = <T,>(col: TableColumn<T>): string => kindOf(col).className;

/** Alignment and font for a column's header. */
export const headerClass = <T,>(col: TableColumn<T>): string => kindOf(col).headerClassName;

/** Cell classes shared by both adapters: kind alignment plus emphasis. */
export const columnClass = <T,>(col: TableColumn<T>): string =>
  cn(kindClass(col), col.emphasis && 'font-semibold');

/** The body of a cell: the caller's override, else the kind's. */
export function renderCell<T>(col: TableColumn<T>, row: T, mode: TableMode): ReactNode {
  if (col.cell) return col.cell(row);
  return kindOf(col).cell(col, row, mode);
}

/** The value a column sorts by. */
export function sortValue<T>(col: TableColumn<T>, row: T): string | number | null {
  const def = kindOf(col);
  if (def.sortValue) return def.sortValue(col, row);
  const v = col.value(row);
  if (v == null || v === '') return null;
  return typeof v === 'number' ? v : String(v);
}

/**
 * The total row, cell by cell (same order as `columns`), or `null` when the
 * table has none. The label sits in the first column unless that column adds
 * up; it is a word, so it reads in the sans face even in a numeric column.
 */
export function totalCells<T>(
  columns: TableColumn<T>[],
  rows: T[],
  totalRow: TotalRow | undefined,
): ReactNode[] | null {
  if (!totalRow) return null;
  const { label = 'Total', values } = totalRow === true ? {} : totalRow;
  return columns.map((col, i) => {
    const def = kindOf(col);
    const figure = contributes(col) && def.total ? def.total(col, rows, values?.[col.id]) : '';
    if (i === 0 && !figure) return <span className="font-sans">{label}</span>;
    return figure;
  });
}
