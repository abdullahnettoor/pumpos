import { computeRange, type RangeClock, type SectionQuery } from '../../pump-ds/index.js';
import { inWindow, sumAmounts, type EntryClock } from '../../utils/ledgerWindow.js';
import type { CollectionRow, CreditSaleRow } from './columns.js';

/** A query result as the Customers tabs read it: the Data Section's slice plus its data. */
export interface QueryOf<T> extends SectionQuery {
  data?: T;
}

/**
 * The fixed-window figures of the Customers tiles (#527): today and this month,
 * independent of any table range. Collections are Office Records, dated by
 * entry date; Credit Sales sit on their Business Day.
 */

const windows = (clock: RangeClock) => ({
  today: computeRange('today', clock),
  month: computeRange('this-month', clock),
});

export interface WindowFigures {
  today: number;
  todayCount: number;
  month: number;
  monthCount: number;
  /** First day of the month, for the tile's period chip. */
  monthFrom: string;
  /** Distinct customers in today's rows. */
  todayCustomers: number;
  /** Distinct customers in the month's rows. */
  monthCustomers: number;
}

function figures<T extends { amount: number | string; customerId?: string | null }>(
  rows: readonly T[],
  dateOf: (r: T) => string | null | undefined,
  clock: RangeClock,
): WindowFigures {
  const { today, month } = windows(clock);
  const todayRows = rows.filter((r) => inWindow(dateOf(r), today));
  const monthRows = rows.filter((r) => inWindow(dateOf(r), month));
  const customers = (list: T[]) => new Set(list.map((r) => r.customerId).filter(Boolean)).size;
  return {
    today: sumAmounts(todayRows),
    todayCount: todayRows.length,
    month: sumAmounts(monthRows),
    monthCount: monthRows.length,
    monthFrom: month.from,
    todayCustomers: customers(todayRows),
    monthCustomers: customers(monthRows),
  };
}

/** Collections by entry date (station calendar date, no Day Start). */
export const collectionFigures = (rows: readonly CollectionRow[], clock: EntryClock) =>
  figures(rows, (r) => r.entryDate, clock);

/** Credit Sales by Business Date (Day Start applies). */
export const creditSaleFigures = (rows: readonly CreditSaleRow[], clock: RangeClock) =>
  figures(rows, (r) => r.businessDate, clock);

/** Rows per payment method, for the method filter chips. */
export function countByMethod(rows: readonly CollectionRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (r.paymentMethod) counts[r.paymentMethod] = (counts[r.paymentMethod] ?? 0) + 1;
  }
  return counts;
}
