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
  /**
   * The figure the row is about, set in semibold. Not for a column with a
   * total row: money cells are regular weight so the total stands out.
   */
  emphasis?: boolean;
  /** Fraction of the table width (`'16%'`); defaults to an equal share. */
  width?: string;
  /**
   * `false` makes the header plain, not a sort button: a column of inputs (a
   * grid the operator fills in), where sorting would reorder rows mid-entry.
   */
  sortable?: boolean;
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
  /** Header alignment: a number's header sits over its figures, in the same sans as every header. */
  align: 'text-left' | 'text-right';
  /** The cell: the shared format, or the status vocabulary. */
  cell<T>(col: ColumnOf<K, T>, row: T, mode: TableMode): ReactNode;
  /** What the column sorts by; the raw value when absent. */
  sortValue?<T>(col: ColumnOf<K, T>, row: T): number | undefined;
  /** The column's total, formatted; absent when the kind does not add up. */
  total?<T>(col: ColumnOf<K, T>, rows: T[], given: Amount): string;
}

const NUMERIC = 'text-right font-mono tabular-nums';

/**
 * Every header, in both adapters: 10px uppercase, weight 500, faint sans. A
 * number's header changes only its alignment; mono sits in the body.
 */
const HEADER = 'text-[10px] font-medium uppercase tracking-[0.04em] text-ink-faint';

const isEmpty = (v: unknown): boolean => v == null || v === '';

/**
 * What a figure sorts by. `undefined` for an empty or broken value, so
 * TanStack's `sortUndefined: 'last'` keeps it below the figures either way.
 */
const toNumber = (v: Amount): number | undefined => {
  if (isEmpty(v)) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * The column's sum. An empty cell adds nothing; a broken one (non-finite)
 * makes the sum `NaN`, which the shared formats print as `—`: counting it as
 * 0 would pass a bad figure off as a real total. `scale` sums in whole units
 * of it (100 for paise), so the total is the sum of the figures shown.
 */
const sum = <T,>(col: { value: (row: T) => Amount }, rows: T[], scale?: number): number => {
  let acc = 0;
  for (const row of rows) {
    const v = col.value(row);
    if (isEmpty(v)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) return Number.NaN;
    acc += scale ? Math.round(n * scale) : n;
  }
  return scale ? acc / scale : acc;
};

const unitOf = <T,>(col: QtyColumn<T>, row: T): string | null | undefined =>
  typeof col.unit === 'function' ? col.unit(row) : col.unit;

const KINDS: { [K in Kind]: KindDef<K> } = {
  money: {
    className: NUMERIC,
    align: 'text-right',
    cell: (col, row) => {
      const v = col.value(row);
      return v == null || v === '' ? '' : formatMoney(v);
    },
    sortValue: (col, row) => toNumber(col.value(row)),
    total: (col, rows, given) => formatMoney(given ?? sum(col, rows, 100)),
  },
  qty: {
    className: NUMERIC,
    align: 'text-right',
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
    align: 'text-left',
    cell: (col, row) => formatDate(col.value(row)),
    sortValue: (col, row) => {
      const v = col.value(row);
      if (v == null || v === '') return undefined;
      const t = (v instanceof Date ? v : new Date(v)).getTime();
      return Number.isNaN(t) ? undefined : t;
    },
  },
  text: {
    className: 'text-left',
    align: 'text-left',
    cell: (col, row) => {
      const v = col.value(row);
      return v == null || v === '' ? '—' : String(v);
    },
  },
  status: {
    className: 'text-left',
    align: 'text-left',
    cell: (col, row, mode) =>
      mode === 'statement' ? (
        <StatusChip status={col.value(row)} size="md" variant="outline" showIcon={false} />
      ) : (
        <StatusChip status={col.value(row)} size="md" />
      ),
  },
};

/**
 * The definition for a column's kind. `KINDS[col.kind]` is the entry for `col`
 * by construction, but TypeScript cannot correlate the two, so this is the one
 * cast in the module.
 */
const kindOf = <T,>(col: TableColumn<T>): KindDef<Kind> => KINDS[col.kind] as KindDef<Kind>;

/**
 * How the column adds up in a total row: its kind's total, unless the column
 * opted out. Only the kinds with a `total` in `KINDS` add up.
 */
const totalOf = <T,>(col: TableColumn<T>): KindDef<Kind>['total'] =>
  (col as { total?: boolean }).total === false ? undefined : kindOf(col).total;

/** Alignment and font for a column's body and total cells. */
export const kindClass = <T,>(col: TableColumn<T>): string => kindOf(col).className;

/** A column's header: the one header style, aligned with its column. */
export const headerClass = <T,>(col: TableColumn<T>): string => cn(HEADER, kindOf(col).align);

/** Cell classes shared by both adapters: kind alignment plus emphasis. */
export const columnClass = <T,>(col: TableColumn<T>): string =>
  cn(kindClass(col), col.emphasis && 'font-semibold');

/** The body of a cell: the caller's override, else the kind's. */
export function renderCell<T>(col: TableColumn<T>, row: T, mode: TableMode): ReactNode {
  if (col.cell) return col.cell(row);
  return kindOf(col).cell(col, row, mode);
}

/** The value a column sorts by. */
export function sortValue<T>(col: TableColumn<T>, row: T): string | number | undefined {
  const def = kindOf(col);
  if (def.sortValue) return def.sortValue(col, row);
  const v = col.value(row);
  if (isEmpty(v)) return undefined;
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
    const total = totalOf(col);
    const figure = total ? total(col, rows, values?.[col.id]) : '';
    if (i === 0 && !figure) return <span className="font-sans">{label}</span>;
    return figure;
  });
}
