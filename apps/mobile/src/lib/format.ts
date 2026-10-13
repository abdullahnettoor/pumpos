/**
 * The one place the mobile app formats rupees. Pure, string-only: figures
 * arrive computed, nothing here derives a business number. Screens import from
 * here; a second set of rupee helpers with different output for the same amount
 * is how two tabs end up disagreeing.
 */
import { formatCompactMoney, formatMoney, formatSignedMoney } from '@pump/ui';

/** Whole rupees, en-IN grouping: `₹2,18,880`. */
export const rupees = (n: number): string => formatMoney(n, { decimals: 0 });

/**
 * `−₹340` (a true minus sign before the symbol) for negatives; zero and any
 * amount that rounds to zero reads `₹0`. With `plus`, a positive amount is
 * `+₹120` too, for a variance where the direction is the point.
 */
export const signedRupees = (n: number, opts: { plus?: boolean } = {}): string =>
  formatSignedMoney(n, { decimals: 0, plus: opts.plus });

/**
 * Paise kept, true minus before the symbol: `−₹125.00`, never `₹-125.00`. For a
 * statement balance, where the ledger sums to the paisa and a rounded figure
 * would not tie back to the rows.
 */
export const signedMoney = (n: number): string => formatSignedMoney(n);

/**
 * The shared compact form (`₹38.5k`, `₹6.82L`, `₹2.5Cr`), for a stat tile's
 * figure or a hero figure ONLY: Home and DSSR day tiles, Money position, the
 * Reports "Last 7 days" tile, and the Insights headline figures. Everywhere else
 * (list and detail rows, a party's facts, statements, aging legends, prose and
 * every aria-label) shows the exact amount with `rupees` (`₹40,000`): a reader
 * acting on a figure needs it whole, and a screen reader should not say "k".
 */
export const compactRupees = (n: number): string => formatCompactMoney(n);

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
