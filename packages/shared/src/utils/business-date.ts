/**
 * Business-date resolution. The "business day" a moment belongs to depends on
 * the station's timezone AND its configured day-start boundary (e.g. a fuel
 * station whose day runs 06:00 → 06:00). This is the single source of truth for
 * turning an instant into a `YYYY-MM-DD` business-day label — use it everywhere
 * instead of `new Date().toISOString().slice(0,10)` (which is UTC-only and
 * ignores the start boundary).
 */

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export interface BusinessDateOptions {
  /** Instant to resolve. Defaults to now. */
  now?: Date;
  /** IANA timezone (e.g. 'Asia/Kolkata'). Falls back to Asia/Kolkata, then UTC. */
  timeZone?: string | null;
  /** Day-start boundary 'HH:MM'. A moment before this rolls to the previous date. */
  dayStartsAt?: string | null;
}

/** True only for a real Gregorian calendar date in canonical YYYY-MM-DD form. */
export function isValidBusinessDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Resolve the business-day label (`YYYY-MM-DD`) for an instant, in the station's
 * timezone and honoring the day-start boundary. A moment earlier than
 * `dayStartsAt` (station-local) belongs to the previous business day.
 */
export function resolveBusinessDate(opts: BusinessDateOptions = {}): string {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone || DEFAULT_TIMEZONE;
  const dayStartsAt = opts.dayStartsAt || '00:00';

  let year: number;
  let month: number;
  let day: number;
  let hour: number;
  let minute: number;
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(now).map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    year = Number(parts.year);
    month = Number(parts.month);
    day = Number(parts.day);
    hour = Number(parts.hour) % 24; // some engines emit '24' at midnight
    minute = Number(parts.minute);
  } catch {
    // Invalid timezone → fall back to the UTC calendar date.
    return now.toISOString().slice(0, 10);
  }

  const [startH, startM] = dayStartsAt.split(':').map((n) => Number(n) || 0);
  if (hour * 60 + minute < startH * 60 + startM) {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() - 1);
    year = d.getUTCFullYear();
    month = d.getUTCMonth() + 1;
    day = d.getUTCDate();
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Resolve the Entry Date (`YYYY-MM-DD`) of an Office Record: the plain
 * station-timezone calendar date of the instant. Unlike a business date, Day
 * Start never applies — an office entry at 03:00 on the 15th is dated the 15th
 * even when the sales day starts at 06:00 (ADR 0005).
 */
export function resolveEntryDate(opts: { now?: Date; timeZone?: string | null } = {}): string {
  return resolveBusinessDate({ now: opts.now, timeZone: opts.timeZone, dayStartsAt: '00:00' });
}

/**
 * A business date shifted by whole days, staying in `YYYY-MM-DD`.
 *
 * Business dates are calendar labels, not instants, so the arithmetic is done
 * in UTC deliberately — it must not be perturbed by a timezone or by a DST
 * transition in the station's zone. Rolling a month or year boundary is the
 * point: naive `${y}-${m}-${d - 13}` produces `2026-03-(-8)`.
 */
export function shiftBusinessDate(businessDate: string, deltaDays: number): string {
  const d = new Date(`${businessDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Whole calendar days from one business date to another (`to - from`; negative
 * when `to` is earlier). Calendar labels, so UTC arithmetic like `shiftBusinessDate`.
 */
export function businessDateDiffDays(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** First and last calendar date (`YYYY-MM-DD`) of a `YYYY-MM` month. Throws on a malformed month. */
export function monthBounds(month: string): { from: string; to: string } {
  const match = MONTH_KEY.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const lastDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** Current sales-month and calendar-month windows used by party finance reads. */
export function partyMonthWindows(input: { now: Date; timeZone: string; dayStartsAt: string }) {
  const currentBusinessDate = resolveBusinessDate({
    now: input.now,
    timeZone: input.timeZone,
    dayStartsAt: input.dayStartsAt,
  });
  const entryDate = resolveEntryDate({ now: input.now, timeZone: input.timeZone });
  const businessMonth = monthBounds(currentBusinessDate.slice(0, 7));
  const entryMonth = monthBounds(entryDate.slice(0, 7));
  return {
    currentBusinessDate,
    entryDate,
    businessMonth,
    entryMonth,
    months: {
      businessMonth: businessMonth.from.slice(0, 7),
      entryMonth: entryMonth.from.slice(0, 7),
    },
  };
}

/** Extract date-resolution settings from a station `settings` JSONB blob. */
export function businessDateSettings(settings: unknown): { timeZone: string; dayStartsAt: string } {
  const s = (settings ?? {}) as Record<string, unknown>;
  return {
    timeZone: (typeof s.timezone === 'string' && s.timezone) || DEFAULT_TIMEZONE,
    dayStartsAt:
      (typeof s.business_day_starts_at === 'string' && s.business_day_starts_at) || '00:00',
  };
}
