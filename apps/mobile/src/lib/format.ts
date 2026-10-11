/**
 * The one place the mobile app formats rupees. Pure, string-only: figures
 * arrive computed, nothing here derives a business number. Screens import from
 * here; a second set of rupee helpers with different output for the same amount
 * is how two tabs end up disagreeing.
 */
import { formatMoney, inr } from '@pump/ui';

/** Whole rupees, en-IN grouping: `₹2,18,880`. */
export const rupees = (n: number): string => formatMoney(n, { decimals: 0 });

/**
 * `−₹340` (a true minus sign before the symbol) for negatives; zero and any
 * amount that rounds to zero reads `₹0`. With `plus`, a positive amount is
 * `+₹120` too, for a variance where the direction is the point.
 */
export function signedRupees(n: number, opts: { plus?: boolean } = {}): string {
  const whole = Math.round(Math.abs(n));
  if (whole === 0) return rupees(0);
  if (n < 0) return `−${rupees(whole)}`;
  return opts.plus ? `+${rupees(whole)}` : rupees(whole);
}

/**
 * Paise kept, true minus before the symbol: `−₹125.00`, never `₹-125.00`. For a
 * statement balance, where the ledger sums to the paisa and a rounded figure
 * would not tie back to the rows.
 */
export const signedMoney = (n: number): string => (n < 0 ? `−${inr(-n)}` : inr(n));

/** Whole rupees below a lakh, then `₹6.82L` / `₹2.5Cr`, for tiles with little room. */
export function compactRupees(n: number): string {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, '');
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  return signedRupees(n);
}

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
