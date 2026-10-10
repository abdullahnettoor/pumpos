import { formatMoney } from '@pump/ui';

/** Whole rupees, en-IN grouping: `₹2,18,880`. */
export const rupees = (n: number): string => formatMoney(n, { decimals: 0 });

/** `−₹340` (a true minus sign before the symbol) for negatives. */
export const signedRupees = (n: number): string => (n < 0 ? `−${rupees(Math.abs(n))}` : rupees(n));

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
