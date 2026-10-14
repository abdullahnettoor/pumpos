import { unitLabel } from '@pump/shared';

/** What a money figure reads when the value is present but not a finite number. */
const NOT_A_FIGURE = '—';

/**
 * Money & number formatting for Indian fuel retail — the single source of truth
 * so every amount renders consistently (₹ symbol, en-IN grouping, 2 decimals,
 * a negative as `−₹1,200.00`).
 * Replaces the many ad-hoc `x.toLocaleString('en-IN')` calls that dropped
 * decimals and produced mixed formats (₹5,000 vs ₹5,000.00 vs ₹5,000.5).
 *
 * `symbol: false` drops only the `₹` (a cell whose column header carries the
 * currency): the sign rule is the same, `−1,200.00`, and an amount that rounds
 * to zero reads `0.00`, never `-0.00`.
 *
 * A missing amount (`null`/`undefined`) reads as zero, the long-standing
 * contract for optional totals. A value that is present but not a finite
 * number (`NaN`, `Infinity`, `'abc'`) reads `—`, as `formatCompactMoney` and
 * `formatQuantity` do: printing `₹0.00` for a broken figure would pass a bad
 * number off as a real zero on a screen or a PDF.
 */
export function formatMoney(
  value: number | string | null | undefined,
  opts: { decimals?: number; symbol?: boolean } = {},
): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return NOT_A_FIGURE;
  const decimals = opts.decimals ?? 2;
  const sign = signOf(n, decimals);
  const body = (sign === 'zero' ? 0 : Math.abs(n)).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // A negative reads `−₹1,200.00` (true minus before the symbol), never `₹-1,200.00`.
  return `${sign === 'negative' ? MINUS : ''}${opts.symbol === false ? '' : '₹'}${body}`;
}

/** ₹ amount with 2 decimals (the default money format). */
export const inr = (value: number | string | null | undefined): string => formatMoney(value);

/** The true minus sign (U+2212) every signed figure uses; never the ASCII hyphen. */
export const MINUS = '\u2212';

/** Which side of zero a signed figure falls on, after rounding to what is shown. */
export type FigureSign = 'negative' | 'zero' | 'positive';

/** A signed figure split for display: the full text plus its sign, so callers pick a tone. */
export interface SignedFigure {
  /** The display string: `−₹1,200.00`, `₹0.00`, `+₹1,200.00` (with `plus`). */
  text: string;
  /** The sign of the amount as shown: an amount that rounds to zero is `'zero'`. */
  sign: FigureSign;
  /** The unsigned display string: `₹1,200.00`. */
  magnitude: string;
}

interface SignedMoneyOptions {
  /** Decimal places; 2 (paise) by default, 0 for whole rupees. */
  decimals?: number;
  /** Prefix a positive amount with `+` (a variance, where the direction is the point). */
  plus?: boolean;
  /** `false` drops the `₹` (a cell whose header carries the currency); the sign rule is unchanged. */
  symbol?: boolean;
}

const signOf = (n: number, decimals: number): FigureSign => {
  const shown = Number(Math.abs(n).toFixed(decimals));
  if (shown === 0) return 'zero';
  return n < 0 ? 'negative' : 'positive';
};

const withSign = (sign: FigureSign, magnitude: string, plus: boolean): string =>
  sign === 'negative'
    ? `${MINUS}${magnitude}`
    : sign === 'positive' && plus
      ? `+${magnitude}`
      : magnitude;

/**
 * Signed money, split into text and sign. The one signed-money rule for every
 * screen and PDF: a true minus before the symbol (`−₹1,200.00`, never
 * `₹-1,200.00` or `-₹1,200.00`); an amount that rounds to zero reads unsigned
 * (`₹0.00`); `plus` adds `+` to a positive amount. Use `sign` to choose a tone
 * (e.g. a variance: negative = short, positive = excess) — what a sign means is
 * the caller's call, this only reports it. A non-finite value reads `—` with
 * sign `'zero'` (see `formatMoney`).
 */
export function signedMoneyParts(
  value: number | string | null | undefined,
  opts: SignedMoneyOptions = {},
): SignedFigure {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return { text: NOT_A_FIGURE, sign: 'zero', magnitude: NOT_A_FIGURE };
  const decimals = opts.decimals ?? 2;
  const sign = signOf(n, decimals);
  const magnitude = formatMoney(sign === 'zero' ? 0 : Math.abs(n), {
    decimals,
    symbol: opts.symbol,
  });
  return { text: withSign(sign, magnitude, opts.plus ?? false), sign, magnitude };
}

/** Signed money as a string: `−₹1,200.00`. See `signedMoneyParts` for the rule. */
export const formatSignedMoney = (
  value: number | string | null | undefined,
  opts: SignedMoneyOptions = {},
): string => signedMoneyParts(value, opts).text;

/**
 * Quantity / volume formatting (e.g. liters). Grouped, no currency symbol.
 * Defaults to 2 decimals; pass 3 for precise nozzle/dip readings.
 *
 * @deprecated Use `formatQuantity` (unit-aware decimals, true minus, `—` for a
 * missing value; `{ decimals: 3 }` for meter/dip readings). Callers migrate in
 * their area tickets.
 */
export function formatQty(
  value: number | string | null | undefined,
  decimals = 2,
  unit?: string | null,
): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const num = safe.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit ? `${num} ${unit}` : num;
}

/** The unit as shown, and how many decimals it carries. */
function quantityUnit(unit: string | null | undefined): { label: string; decimals: number } {
  const label = unitLabel(unit);
  if (label === 'L' || label === 'kg') return { label, decimals: 2 };
  if (/^kl$/i.test(label)) return { label: 'KL', decimals: 1 };
  if (/^kg\s*\/\s*m(3|³)$/i.test(label)) return { label: 'kg/m³', decimals: 1 };
  return { label, decimals: 0 };
}

/**
 * A quantity with its unit, Indian grouping and the unit's own decimals — the
 * one quantity format for screens and PDFs:
 * litres (and kg) 2 (`1,240.00 L`), KL 1 (`18.5 KL`), density 1
 * (`832.5 kg/m³`), counted units 0 (`12 Nos`). Any litre spelling reads `L`;
 * a blank unit reads as litres. Negative reads `−42.00 L` (true minus);
 * `plus` adds `+` to a positive (a variance); a missing amount is `fallback` (`—`).
 * `decimals` overrides the unit's own places, for a reading that carries more
 * precision than a quantity (a meter or dip reading: `12,345.678 L`).
 */
export function formatQuantity(
  value: number | string | null | undefined,
  unit: string | null | undefined,
  opts: { plus?: boolean; fallback?: string; decimals?: number } = {},
): string {
  if (value == null || value === '') return opts.fallback ?? '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return opts.fallback ?? '—';
  const { label, decimals: unitDecimals } = quantityUnit(unit);
  return `${signedFigure(n, opts.decimals ?? unitDecimals, opts.plus ?? false)} ${label}`;
}

/** A grouped figure with a true minus (and `+` when `plus`); rounds-to-zero reads unsigned. */
function signedFigure(n: number, decimals: number, plus: boolean): string {
  const sign = signOf(n, decimals);
  const body = (sign === 'zero' ? 0 : Math.abs(n)).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return withSign(sign, body, plus);
}

/**
 * A density figure in kg/m³ without its unit, where the label or column names
 * it: 1 decimal like `formatQuantity` (`741.2`). `plus` signs a change (`+0.6`,
 * `−5.3`; one that rounds to zero reads `0.0`). A missing reading is `—`.
 */
export function formatDensity(
  value: number | null | undefined,
  opts: { plus?: boolean } = {},
): string {
  if (value == null || !Number.isFinite(value)) return NOT_A_FIGURE;
  return signedFigure(value, quantityUnit('kg/m³').decimals, opts.plus ?? false);
}

/** Temperature with at most one decimal: `30 °C`, `28.5 °C`. A missing reading is `—`. */
export function formatTemperature(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NOT_A_FIGURE;
  return `${signedFigure(value, Number.isInteger(Math.round(value * 10) / 10) ? 0 : 1, false)} °C`;
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

/**
 * Format a business date (`YYYY-MM-DD`) as `09 Jul 2026`.
 *
 * Business dates are a bare calendar day with no time or zone (see
 * AGENTS.md "Business-Day Date Resolution"), so this formats in UTC: building a
 * local-midnight Date would let a negative-offset timezone roll the label back
 * to the previous day. Returns the input unchanged if it isn't a valid date.
 */
export function formatBusinessDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-IN', { ...DATE_FULL, timeZone: 'UTC' });
}

/** Canonical date: `11 Jul 2026`. Pass `compact` for a 2-digit year (`11 Jul 26`). */
export function formatDate(
  value: string | number | Date | null | undefined,
  opts: { compact?: boolean; fallback?: string } = {},
): string {
  const d = toDate(value);
  if (!d) return opts.fallback ?? '—';
  return d.toLocaleDateString(
    'en-IN',
    opts.compact ? { day: '2-digit', month: 'short', year: '2-digit' } : DATE_FULL,
  );
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

/**
 * Elapsed time since a shift opened, as `Nh Nm` (e.g. `6h 12m`) — the format
 * operators read for a shift's age in the status bar and the shift control bar.
 * Always includes the hours segment so both surfaces print the same shape.
 * Clamps negatives to `0h 0m`; returns the fallback for an unparseable input.
 */
export function formatElapsedSince(
  openedAt: string | number | Date | null | undefined,
  opts: { fallback?: string } = {},
): string {
  const d = toDate(openedAt);
  if (!d) return opts.fallback ?? '—';
  const mins = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60_000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const COMPACT_STEPS = [
  { size: 1e3, suffix: 'k', decimals: 1 },
  { size: 1e5, suffix: 'L', decimals: 2 },
  { size: 1e7, suffix: 'Cr', decimals: 2 },
] as const;

/**
 * The shared compact money form, for tiles and dense cells: `₹38.5k`,
 * `₹2.87L`, `₹2.5Cr`; whole rupees below a thousand (`₹850`). Trailing zeros
 * are trimmed (`₹2L`), a figure that rounds up carries to the next unit
 * (`₹1L`, never `₹100k`), and a negative reads `−₹2.5L`. Crores keep Indian
 * grouping however large (`₹1,00,000Cr`). Missing or non-finite is `—` (as
 * `formatMoney` for a non-finite value).
 */
export function formatCompactMoney(value: number | string | null | undefined): string {
  if (value == null || value === '') return NOT_A_FIGURE;
  const n = Number(value);
  if (!Number.isFinite(n)) return NOT_A_FIGURE;
  const a = Math.abs(n);
  let body = `₹${Math.round(a).toLocaleString('en-IN')}`;
  if (Math.round(a) >= 1e3) {
    for (const [i, step] of COMPACT_STEPS.entries()) {
      const v = Number((a / step.size).toFixed(step.decimals));
      const last = i === COMPACT_STEPS.length - 1;
      if (last || v < COMPACT_STEPS[i + 1].size / step.size) {
        body = `₹${v.toLocaleString('en-IN', { maximumFractionDigits: step.decimals })}${step.suffix}`;
        break;
      }
    }
  }
  return n < 0 && Math.round(a) > 0 ? `${MINUS}${body}` : body;
}

/** Elapsed between two instants as `Nh Nm`; clamps negatives to `0h 0m`. */
export function formatElapsedBetween(fromMs: number, toMs: number): string {
  const mins = Math.max(0, Math.floor((toMs - fromMs) / 60_000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** A business date (`YYYY-MM-DD`) as `Thu 8 Oct`; the input when invalid. */
export function formatShortDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const part = (o: Intl.DateTimeFormatOptions) =>
    dt.toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' });
  return `${part({ weekday: 'short' })} ${d} ${part({ month: 'short' })}`;
}

/**
 * Clock time in a timezone, lowercase: `6:10 am` (`compact`: `6 am` on the hour).
 * The space before am/pm is non-breaking so the time never wraps apart.
 */
export function formatClockInZone(
  value: string | number | Date,
  timeZone?: string,
  opts: { compact?: boolean } = {},
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const min = get('minute');
  const mm = opts.compact && min === '00' ? '' : `:${min}`;
  return `${get('hour')}${mm}\u00a0${get('dayPeriod').toLowerCase()}`;
}

/** `HH:MM` (24h) as `2:00 pm`; empty when unparseable. */
export function formatHHMM(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'pm' : 'am'}`;
}

/** Timeline axis hour: `6a`, `12p`. */
export function formatAxisHour(ms: number, timeZone?: string): string {
  const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: true }).format(
    ms,
  );
  return h.replace(/\s?(AM|PM)/i, (_, m: string) => m[0].toLowerCase());
}

/** `6 Oct` from an ISO instant (in `timeZone`) or a `YYYY-MM-DD` business date. */
export function formatDayMonth(value: string | number | Date, timeZone?: string): string {
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = dateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: dateOnly ? 'UTC' : timeZone,
  });
}
