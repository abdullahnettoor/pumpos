import { formatCalendarDate } from '@pump/shared';

/** A calendar date (`YYYY-MM-DD`) as its parts; null when it isn't one. */
function parts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** `2026-10-11` + n days, as a calendar date (no time zone involved). */
export function shiftDate(date: string, days: number): string {
  const p = parts(date);
  if (!p) return date;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** `Sun 11 Oct 2026`: the date button's label (#603). The input when invalid. */
export function formatPickerDate(date: string): string {
  const p = parts(date);
  if (!p) return date;
  const wd = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  return `${wd} ${formatCalendarDate(date)}`;
}

/** The `YYYY-MM` a date falls in. */
export const monthOf = (date: string): string => date.slice(0, 7);

/** `2026-10` + n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * A month as weeks of 7 days, Monday first (an Indian calendar reads Mon–Sun).
 * Days outside the month are `null`.
 */
export function monthWeeks(month: string): Array<Array<string | null>> {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: Array<string | null> = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => iso(y, m, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** `October 2026`, the calendar's caption. */
export function monthCaption(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${name} ${y}`;
}
