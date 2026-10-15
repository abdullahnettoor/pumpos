/**
 * The one date style on screen and in PDFs (#603): `5 Oct 2026`. The day has
 * no leading zero, and the month comes from a fixed table rather than a
 * locale, because ICU's en-IN / en-GB print "Sept" on some runtimes and "Sep"
 * on others.
 *
 * Every date formatter (`formatDate`, `formatBusinessDate`,
 * `formatStationDateTime`, statement dates, event activity) builds on these,
 * so they cannot drift apart.
 */

export const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export type DisplayYear = 'full' | 'short' | 'none';

/** `5 Oct 2026` from calendar parts (month 1–12). `short`: `5 Oct 26`; `none`: `5 Oct`. */
export function displayDate(
  year: number,
  month: number,
  day: number,
  opts: { year?: DisplayYear } = {},
): string {
  const name = SHORT_MONTH_NAMES[month - 1] ?? String(month);
  const y = opts.year ?? 'full';
  if (y === 'none') return `${day} ${name}`;
  return `${day} ${name} ${y === 'short' ? String(year).slice(-2) : year}`;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A calendar date (`YYYY-MM-DD`, e.g. a business date) as `5 Oct 2026`. It has
 * no time or zone, so no timezone can roll it to another day. Returns the
 * input unchanged when it isn't a date.
 */
export function formatCalendarDate(iso: string, opts: { year?: DisplayYear } = {}): string {
  const m = CALENDAR_DATE.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!y || mo < 1 || mo > 12 || !d) return iso;
  return displayDate(y, mo, d, opts);
}

/**
 * The calendar day of an instant on a clock: `timeZone`, or this device's
 * zone when omitted. Null for an invalid date.
 */
export function instantDateParts(
  value: Date,
  timeZone?: string,
): { year: number; month: number; day: number } | null {
  if (Number.isNaN(value.getTime())) return null;
  if (!timeZone) {
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(value);
  const at = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: at('year'), month: at('month'), day: at('day') };
}

/** An instant's day as `5 Oct 2026` on a clock (`timeZone`, or this device's). */
export function formatInstantDate(
  value: Date,
  timeZone?: string,
  opts: { year?: DisplayYear } = {},
): string | null {
  const p = instantDateParts(value, timeZone);
  return p ? displayDate(p.year, p.month, p.day, opts) : null;
}
