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

/** Extract date-resolution settings from a station `settings` JSONB blob. */
export function businessDateSettings(settings: unknown): { timeZone: string; dayStartsAt: string } {
  const s = (settings ?? {}) as Record<string, unknown>;
  return {
    timeZone: (typeof s.timezone === 'string' && s.timezone) || DEFAULT_TIMEZONE,
    dayStartsAt:
      (typeof s.business_day_starts_at === 'string' && s.business_day_starts_at) || '00:00',
  };
}
