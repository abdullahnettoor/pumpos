import { inr } from '@pump/ui';

/** `₹2L`, `₹1.5L`, `₹2.4Cr`, `₹8,500`: a credit limit or a hero total in a few characters. */
export function compactRupees(value: number): string {
  const abs = Math.abs(value);
  const trim = (n: number) => String(Number(n.toFixed(2)));
  const sign = value < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

/** A balance that may be negative (an advance): `−₹125.00`, never `₹-125.00`. */
export function signedRupees(value: number): string {
  return value < 0 ? `−${inr(-value)}` : inr(value);
}
