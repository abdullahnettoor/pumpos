/**
 * Money & number formatting for Indian fuel retail — the single source of truth
 * so every amount renders consistently (₹ symbol, en-IN grouping, 2 decimals).
 * Replaces the many ad-hoc `x.toLocaleString('en-IN')` calls that dropped
 * decimals and produced mixed formats (₹5,000 vs ₹5,000.00 vs ₹5,000.5).
 */
export function formatMoney(
  value: number | string | null | undefined,
  opts: { decimals?: number; symbol?: boolean } = {},
): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const decimals = opts.decimals ?? 2;
  const body = safe.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return opts.symbol === false ? body : `₹${body}`;
}

/** ₹ amount with 2 decimals (the default money format). */
export const inr = (value: number | string | null | undefined): string => formatMoney(value);

/**
 * Quantity / volume formatting (e.g. liters). Grouped, no currency symbol.
 * Defaults to 2 decimals; pass 3 for precise nozzle/dip readings.
 */
export function formatQty(value: number | string | null | undefined, decimals = 2): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Date & time formatting — the single source of truth so every date renders
 * identically across the app (canonical `DD Mon YYYY`, en-IN, day-first). Use
 * the `DateText` pump-ds primitive for the visual (icon + text); use these
 * functions when you only need the string (labels, PDFs, ledger rows).
 *
 * Date-only strings (`YYYY-MM-DD`, e.g. a business date) are parsed as LOCAL
 * calendar dates — NOT via `new Date('2026-07-11')` which is UTC-midnight and
 * shifts back a day in negative-offset timezones. This also fixes latent
 * off-by-one bugs in the old ad-hoc `new Date(x).toLocaleDateString()` calls.
 */
export function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_FULL: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

/** Canonical date: `11 Jul 2026`. Pass `compact` for a 2-digit year (`11 Jul 26`). */
export function formatDate(
  value: string | number | Date | null | undefined,
  opts: { compact?: boolean; fallback?: string } = {},
): string {
  const d = toDate(value);
  if (!d) return opts.fallback ?? '—';
  return d.toLocaleDateString('en-IN', opts.compact ? { day: '2-digit', month: 'short', year: '2-digit' } : DATE_FULL);
}

/** Canonical date + time: `11 Jul 2026, 06:30 am`. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  opts: { fallback?: string } = {},
): string {
  const d = toDate(value);
  if (!d) return opts.fallback ?? '—';
  return d.toLocaleString('en-IN', { ...DATE_FULL, hour: '2-digit', minute: '2-digit' });
}

/** Canonical time-of-day: `06:30 am`. */
export function formatTime(
  value: string | number | Date | null | undefined,
  opts: { fallback?: string } = {},
): string {
  const d = toDate(value);
  if (!d) return opts.fallback ?? '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
