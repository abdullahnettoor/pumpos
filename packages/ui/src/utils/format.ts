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
