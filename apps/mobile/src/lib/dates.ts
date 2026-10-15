/**
 * Date and time labels for Home. Two kinds of input, kept apart:
 *  - an instant (`Date.parse(openedAt)`) shown in the STATION's timezone;
 *  - a Business Date (`YYYY-MM-DD`), a calendar label with no instant behind it,
 *    read from its parts so the device's zone cannot shift the day.
 * Day and month come from the shared `@pump/shared` display-date formatter
 * (`9 Oct`, `Sep`), as on desktop (#609).
 */
import {
  formatCalendarDate,
  formatInstantDate,
  resolveEntryDate,
  SHORT_MONTH_NAMES,
  stationMinuteOfDay,
} from '@pump/shared';

const LOCALE = 'en-IN';

/** Calendar date (`YYYY-MM-DD`) of an instant in the station's timezone. */
export const stationDay = (ms: number, timeZone: string): string =>
  resolveEntryDate({ now: new Date(ms), timeZone });

/** `2:00 pm` in the station's timezone. */
export const stationTime = (ms: number, timeZone: string): string =>
  new Intl.DateTimeFormat(LOCALE, { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(ms))
    .toLowerCase();

export { stationMinuteOfDay };

/** `9 Oct` in the station's timezone (the shared display-date months: `Sep`, never `Sept`). */
export const stationDayMonth = (ms: number, timeZone: string): string =>
  formatInstantDate(new Date(ms), timeZone, { year: 'none' }) ?? '';

/** `Fri, 9 Oct` for a Business Date (the shared display-date months). */
export const businessDateLabel = (businessDate: string): string =>
  `${businessWeekday(businessDate)}, ${formatCalendarDate(businessDate, { year: 'none' })}`;

/** `Fri` for a Business Date (a calendar weekday: no timezone can shift it). */
export const businessWeekday = (businessDate: string): string => weekdayOf(businessDate);

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

/** `Oct` (`Sep`, never `Sept`). */
export const monthShort = (m: number): string => SHORT_MONTH_NAMES[m - 1] ?? String(m);

/**
 * `Thu 15 Oct 2026`: a picked date as desktop's `DatePickerButton` reads it,
 * shown beside a native date input, whose own "15/10/2026" reads either way
 * round (#609). '' for no date.
 */
export const pickedDateLabel = (date: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${weekdayOf(date)} ${formatCalendarDate(date)}` : '';

/** `2026-10-08` -> `8 Oct`. */
export const shortDate = (date: string): string => formatCalendarDate(date, { year: 'none' });
