import React, { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { StatusChip } from '../chip/StatusChip.js';
import { STATUS_MAP, type PumpStatus } from '../chip/status-map.js';
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
   * The cell as plain text, for a PDF or a print that cannot render `cell`.
   * Without `cell` it is the cell too. Set it whenever `cell` changes the
   * words or figures, so the screen and the PDF print the same thing.
   */
  text?: (row: T) => string;
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
 *
 * `derive: false` prints only the figures in `values` and never sums a
 * column: for a report whose totals are stored (the DSR). There a column
 * missing from `values` stays blank, and `null` prints `—` (a figure that is
 * not added up, such as volumes across L and kg).
 *
 * `units` names the unit of a qty figure in `values`, when the total's unit is
 * not the rows' own (the DSR's shift total takes the day's fuel unit).
 */
export type TotalRow =
  | boolean
  | {
      label?: string;
      values?: Record<string, Amount>;
      units?: Record<string, string>;
      derive?: boolean;
    };

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
  /** The cell as plain text: the shared format, or the status vocabulary's word. */
  text<T>(col: ColumnOf<K, T>, row: T): string;
  /** The cell, when it is more than its text (a status chip). */
  cell?<T>(col: ColumnOf<K, T>, row: T, mode: TableMode): ReactNode;
  /** What the column sorts by; the raw value when absent. */
  sortValue?<T>(col: ColumnOf<K, T>, row: T): number | undefined;
  /** The column's total, formatted; absent when the kind does not add up. */
  total?<T>(col: ColumnOf<K, T>, rows: T[], given: Amount, unit?: string): string;
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
    text: (col, row) => {
      const v = col.value(row);
      return v == null || v === '' ? '' : formatMoney(v);
    },
    sortValue: (col, row) => toNumber(col.value(row)),
    total: (col, rows, given) => formatMoney(given ?? sum(col, rows, 100)),
  },
  qty: {
    className: NUMERIC,
    align: 'text-right',
    text: (col, row) =>
      formatQuantity(col.value(row), unitOf(col, row), { decimals: col.decimals }),
    sortValue: (col, row) => toNumber(col.value(row)),
    // Quantities are never added across units: a figure the caller passes
    // obeys the same rule as the sum, unless the caller names its unit.
    total: (col, rows, given, unit) => {
      if (unit != null && given != null) {
        return formatQuantity(given, unit, { decimals: col.decimals });
      }
      const units = new Set(rows.map((row) => unitOf(col, row) ?? ''));
      if (units.size > 1) return '—';
      const [rowUnit] = units;
      return formatQuantity(given ?? sum(col, rows), rowUnit, { decimals: col.decimals });
    },
  },
  // Dates sit in the sans face with aligned digits, as the Dashboard prints its times.
  date: {
    className: 'text-left tabular-nums',
    align: 'text-left',
    text: (col, row) => formatDate(col.value(row)),
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
    text: (col, row) => {
      const v = col.value(row);
      return v == null || v === '' ? '—' : String(v);
    },
  },
  status: {
    className: 'text-left',
    align: 'text-left',
    text: (col, row) => STATUS_MAP[col.value(row)].label,
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

/** The body of a cell: the caller's override, else its text, else the kind's. */
export function renderCell<T>(col: TableColumn<T>, row: T, mode: TableMode): ReactNode {
  if (col.cell) return col.cell(row);
  if (col.text) return col.text(row);
  const def = kindOf(col);
  return def.cell ? def.cell(col, row, mode) : def.text(col, row);
}

/**
 * A cell as plain text, as a PDF prints it: the column's `text`, else the
 * kind's format (a status reads its vocabulary word, `Short`).
 */
export function cellText<T>(col: TableColumn<T>, row: T): string {
  return col.text ? col.text(row) : kindOf(col).text(col, row);
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
  const total = totalTexts(columns, rows, totalRow);
  if (!total) return null;
  return total.cells.map((text, i) =>
    i === 0 && total.labelled ? <span className="font-sans">{text}</span> : text,
  );
}

/**
 * The total row as plain text, cell by cell, as a PDF prints it. `labelled`
 * when the first cell holds the label rather than a figure.
 */
export function totalTexts<T>(
  columns: TableColumn<T>[],
  rows: T[],
  totalRow: TotalRow | undefined,
): { cells: string[]; labelled: boolean } | null {
  if (!totalRow) return null;
  const { label = 'Total', values, units, derive = true } = totalRow === true ? {} : totalRow;
  const figures = columns.map((col) => {
    const total = totalOf(col);
    if (!total) return '';
    if (!derive) {
      if (!values || !(col.id in values)) return '';
      if (values[col.id] == null) return '—';
    }
    return total(col, rows, values?.[col.id], units?.[col.id]);
  });
  const labelled = figures.length > 0 && !figures[0];
  if (labelled) figures[0] = label;
  return { cells: figures, labelled };
}
