import type { BusinessDayListItem, BusinessDayListStatus } from '@pump/shared';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Weekday and day of month from a `YYYY-MM-DD` Business Date (calendar label, no timezone). */
export function dayParts(businessDate: string): { weekday: string; day: number } {
  const [y, m, d] = businessDate.split('-').map(Number) as [number, number, number];
  return { weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], day: d };
}

/** `2026-10` -> `October 2026`. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

/** `2026-10-08` -> `8 Oct`. */
export function shortDate(businessDate: string): string {
  const [, m, d] = businessDate.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** Percent change vs the previous week, one decimal; null when there is nothing to compare. */
export function weekChange(total: number, previousTotal: number): number | null {
  if (previousTotal <= 0) return null;
  return Math.round(((total - previousTotal) / previousTotal) * 1000) / 10;
}

/** Bar widths (0-100) relative to the largest total among the visible days. */
export function barWidths(days: readonly Pick<BusinessDayListItem, 'totalSales'>[]): number[] {
  const max = Math.max(0, ...days.map((d) => d.totalSales));
  return days.map((d) => (max > 0 ? Math.round((d.totalSales / max) * 100) : 0));
}

export const STATUS_LABEL: Record<BusinessDayListStatus, string> = {
  LIVE: 'Live',
  DRAFT: 'Draft',
  SEALED: 'Sealed',
};

/** Past Open Business Dates, newest first, for the "waiting to close" tile. */
export function draftDates(days: readonly BusinessDayListItem[]): string[] {
  return days.filter((d) => d.status === 'DRAFT').map((d) => d.businessDate);
}
