import type { DateRange, RangeClock } from '../../pump-ds/index.js';

/**
 * The station clock an Office Record is dated by: its timezone only, no Day
 * Start (ADR 0005). Credit Sales use the full clock (they sit on a Business Day).
 */
export type EntryClock = Pick<RangeClock, 'timeZone'>;

/** Whether a `YYYY-MM-DD` date falls inside a window (both ends counted). */
export const inWindow = (date: string | null | undefined, w: DateRange): boolean =>
  !!date && date >= w.from && date <= w.to;

/** Σ `amount`, in whole paise so the sum is the sum of the figures shown. */
export const sumAmounts = (rows: readonly { amount: number | string }[]): number =>
  rows.reduce((acc, r) => {
    const n = Number(r.amount || 0);
    return acc + (Number.isFinite(n) ? Math.round(n * 100) : 0);
  }, 0) / 100;

export const countOf = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
