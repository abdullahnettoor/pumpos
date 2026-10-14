import React, { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { StatusChip } from '../chip/StatusChip.js';
import { STATUS_MAP, type PumpStatus } from '../chip/status-map.js';
import { formatDate, formatDateTime, formatMoney, formatQuantity } from '../../utils/format.js';

/**
 * What a column holds. The kind decides how the column reads: numbers
 * (`money`, `qty`) are right-aligned mono in header, body and total, formatted
 * by the shared money / quantity formats, and add up in the total row; `date`
 * uses the shared date format; `status` reads the status vocabulary.
 */
export type ColumnKind = 'money' | 'qty' | 'date' | 'text' | 'status';

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
  value: (row: T) => Amount;
  /** Add the column up in the total row. On by default; off for a rate or a balance. */
  total?: boolean;
  /** Decimal places; 2 (paise) by default. */
  decimals?: number;
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
  /** Show the time too (`11 Jul 2026, 06:30 am`). */
  withTime?: boolean;
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

export const isNumeric = (col: Pick<TableColumn<unknown>, 'kind'>): boolean =>
  col.kind === 'money' || col.kind === 'qty';

/** Alignment and font for every cell of a column: header, body and total. */
export function kindClass(col: Pick<TableColumn<unknown>, 'kind'>): string {
  if (isNumeric(col)) return 'text-right font-mono tabular-nums';
  if (col.kind === 'date') return 'text-left font-mono tabular-nums';
  return 'text-left';
}

/** Header alignment and font: numbers sit over their figures in mono; every other header is a word. */
export const headerClass = (col: Pick<TableColumn<unknown>, 'kind'>): string =>
  isNumeric(col) ? kindClass(col) : 'text-left';

const unitOf = <T,>(col: QtyColumn<T>, row: T): string | null | undefined =>
  typeof col.unit === 'function' ? col.unit(row) : col.unit;

const money = (col: MoneyColumn<unknown>, v: Amount) => formatMoney(v, { decimals: col.decimals });

const qty = (col: QtyColumn<unknown>, v: Amount, unit: string | null | undefined) =>
  formatQuantity(v, unit, { decimals: col.decimals });

/** A cell's text in the shared format, for a kind with a formatter. */
function cellText<T>(col: TableColumn<T>, row: T): string {
  switch (col.kind) {
    case 'money':
      return money(col as MoneyColumn<unknown>, col.value(row));
    case 'qty':
      return qty(col as QtyColumn<unknown>, col.value(row), unitOf(col, row));
    case 'date':
      return col.withTime ? formatDateTime(col.value(row)) : formatDate(col.value(row));
    case 'text': {
      const v = col.value(row);
      return v == null || v === '' ? '—' : String(v);
    }
    case 'status':
      return STATUS_MAP[col.value(row)].label;
  }
}

/** The body of a cell: the caller's override, the status vocabulary, or the formatted text. */
export function renderCell<T>(col: TableColumn<T>, row: T, mode: TableMode): ReactNode {
  if (col.cell) return col.cell(row);
  if (col.kind === 'status') {
    return mode === 'statement' ? (
      <StatusChip status={col.value(row)} size="xs" variant="outline" showIcon={false} />
    ) : (
      <StatusChip status={col.value(row)} size="xs" />
    );
  }
  return cellText(col, row);
}

/** The raw value a column sorts by. */
export function sortValue<T>(col: TableColumn<T>, row: T): string | number | null {
  const v = col.value(row);
  if (v == null || v === '') return null;
  if (isNumeric(col)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' ? v : String(v);
}

const contributes = (col: TableColumn<unknown>): boolean =>
  (col.kind === 'money' || col.kind === 'qty') && col.total !== false;

/** One column's total, formatted; `''` when the column does not add up. */
function totalText<T>(col: TableColumn<T>, rows: T[], given: Amount | undefined): string {
  if (!contributes(col as TableColumn<unknown>)) return '';
  const sum = () => rows.reduce((acc, row) => acc + (Number(col.value(row) as Amount) || 0), 0);
  if (col.kind === 'money') return money(col as MoneyColumn<unknown>, given ?? sum());
  const q = col as QtyColumn<T>;
  const units = new Set(rows.map((row) => unitOf(q, row) ?? ''));
  if (given === undefined && units.size > 1) return '—';
  const unit = typeof q.unit === 'function' ? (rows[0] ? q.unit(rows[0]) : null) : q.unit;
  return qty(q as QtyColumn<unknown>, given ?? sum(), unit);
}

/**
 * The total row, cell by cell (same order as `columns`), or `null` when the
 * table has none. The label sits in the first column unless that column adds
 * up; it is a word, so it reads in the sans face even in a mono date column.
 */
export function totalCells<T>(
  columns: TableColumn<T>[],
  rows: T[],
  totalRow: TotalRow | undefined,
): ReactNode[] | null {
  if (!totalRow) return null;
  const opts = totalRow === true ? {} : totalRow;
  return columns.map((col, i) => {
    const figure = totalText(col, rows, opts.values?.[col.id]);
    if (i === 0 && !figure) return <span className="font-sans">{opts.label ?? 'Total'}</span>;
    return figure;
  });
}

/** Cell classes shared by both adapters: kind alignment plus emphasis. */
export const columnClass = (col: TableColumn<unknown>): string =>
  cn(kindClass(col), col.emphasis && 'font-semibold');
