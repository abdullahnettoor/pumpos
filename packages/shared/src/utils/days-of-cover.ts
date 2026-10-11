/**
 * Tank days of cover: how long a tank's current stock lasts at its recent
 * selling rate. The figure itself is computed on the server (core
 * `computeTankCover`); this module owns the shared vocabulary around it: the
 * averaging window and how a value is worded, so the Home gauge and the stock
 * alert copy never drift.
 */

/** Closed Business Days averaged to get a tank's daily sales rate. */
export const DAYS_OF_COVER_WINDOW = 7;

/** Covers above this are shown as "30+ days": beyond it the figure is noise. */
export const DAYS_OF_COVER_DISPLAY_CAP = 30;

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/**
 * "2.6 days", "0.9 day", "1.0 day", "0 days", "30+ days"; '' when there is no
 * figure (no sales history). Up to and including one day reads singular.
 */
export function formatDaysOfCover(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days) || days < 0) return '';
  if (days > DAYS_OF_COVER_DISPLAY_CAP) return `${DAYS_OF_COVER_DISPLAY_CAP}+ days`;
  const rounded = oneDecimal(days);
  if (rounded === 0) return '0 days';
  return `${rounded.toFixed(1)} ${rounded <= 1 ? 'day' : 'days'}`;
}

/** Alert copy: "0.9 day of cover left"; '' when there is no figure. */
export function daysOfCoverLeft(days: number | null | undefined): string {
  const text = formatDaysOfCover(days);
  return text ? `${text} of cover left` : '';
}
