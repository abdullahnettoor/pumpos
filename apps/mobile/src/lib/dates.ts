/**
 * Date and time labels for Home. Two kinds of input, kept apart:
 *  - an instant (`Date.parse(openedAt)`) shown in the STATION's timezone;
 *  - a Business Date (`YYYY-MM-DD`), a calendar label with no instant behind it,
 *    always formatted in UTC so the device's zone cannot shift the day.
 * Every Intl call for Home lives here.
 */
import { resolveEntryDate } from '@pump/shared';

const LOCALE = 'en-IN';

/** Calendar date (`YYYY-MM-DD`) of an instant in the station's timezone. */
export const stationDay = (ms: number, timeZone: string): string =>
  resolveEntryDate({ now: new Date(ms), timeZone });

/** `2:00 pm` in the station's timezone. */
export const stationTime = (ms: number, timeZone: string): string =>
  new Intl.DateTimeFormat(LOCALE, { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(ms))
    .toLowerCase();

/** Minutes after local midnight of an instant in the station's timezone. */
export function stationMinuteOfDay(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return at('hour') * 60 + at('minute');
}

/** `9 Oct` in the station's timezone. */
export const stationDayMonth = (ms: number, timeZone: string): string =>
  new Intl.DateTimeFormat(LOCALE, { timeZone, day: 'numeric', month: 'short' }).format(
    new Date(ms),
  );

const businessDateInstant = (businessDate: string) => new Date(`${businessDate}T00:00:00Z`);

/** `Fri, 9 Oct` for a Business Date. */
export const businessDateLabel = (businessDate: string): string =>
  businessDateInstant(businessDate).toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** `Fri` for a Business Date. */
export const businessWeekday = (businessDate: string): string =>
  businessDateInstant(businessDate).toLocaleDateString(LOCALE, {
    weekday: 'short',
    timeZone: 'UTC',
  });

// Plain-calendar labels for a `YYYY-MM-DD` date, read by hand from fixed tables
// (Node's ICU spells September "Sept", the app's does not, and `Date` locale
// formatting would depend on the device).

/** Weekday abbreviations, Sunday first (`Date#getUTCDay` order). */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTH_NAMES = [
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

/** Year, month (1-12) and day of a `YYYY-MM-DD` date. */
export function dateParts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

/** `Sun` .. `Sat` for a `YYYY-MM-DD` date (calendar weekday, no timezone). */
export function weekdayOf(date: string): (typeof WEEKDAYS)[number] {
  const { y, m, d } = dateParts(date);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** `Oct`. */
export const monthShort = (m: number): string => MONTH_NAMES[m - 1].slice(0, 3);

/** `2026-10-08` -> `8 Oct`. */
export function shortDate(date: string): string {
  const { m, d } = dateParts(date);
  return `${d} ${monthShort(m)}`;
}
