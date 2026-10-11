/**
 * Display formatting for the Insights tab (rupees come from `lib/format`). Pure and string-only: every figure
 * arrives computed from the API, so nothing here derives a business number.
 * Dates are plain `YYYY-MM-DD`, read by the calendar helpers in `lib/dates`.
 */
import { wholeQuantityLabel } from '../money/quantity.js';
import { dateParts, monthShort, shortDate, weekdayOf } from '../dates.js';

/** `n` to at most `dec` decimals, without trailing zeros: 0.8, 12, 6.5. */
export const trim = (n: number, dec: number) => String(Number(n.toFixed(dec)));

/** 2,180 L, with Indian digit grouping. */
export function litres(n: number): string {
  return wholeQuantityLabel(n, 'L');
}

/** `−42 L`, `+6.5 L`, `0 L` (true minus sign, grouping like the rest of the app). */
export function signedLitres(n: number): string {
  const a = Math.abs(n);
  if (Number(trim(a, 1)) === 0) return '0 L';
  const body = `${a.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`;
  return n < 0 ? `−${body}` : `+${body}`;
}

/** "6.4%" for a percent figure (sign supplied by the caller's arrow). */
export function percent(n: number): string {
  return `${trim(Math.abs(n), 1)}%`;
}

/** "Wed 7 Oct". */
export function weekdayDate(iso: string): string {
  return `${weekdayOf(iso)} ${shortDate(iso)}`;
}

/** Single-letter weekday for a bar label ("W"). */
export function weekdayInitial(iso: string): string {
  return weekdayOf(iso)[0];
}

/** "3–9 Oct", or "28 Sep – 4 Oct" across a month. */
export function rangeLabel(from: string, to: string): string {
  const a = dateParts(from);
  const b = dateParts(to);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${monthShort(b.m)}`;
  return `${shortDate(from)} – ${shortDate(to)}`;
}
