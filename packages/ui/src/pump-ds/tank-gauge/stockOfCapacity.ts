import { formatQuantity } from '../../utils/format.js';

/**
 * A tank's stock in the shared quantity format, whole units (#603): litres and
 * kg read `13,000 L` / `1,200 kg`. Stock and capacity always share one unit
 * and precision, so a tank never reads "13.0 of 20 KL".
 */
export function tankQuantity(value: number, unit?: string | null): string {
  return formatQuantity(value, unit?.trim() || 'L', { decimals: 0 });
}

export interface StockOfCapacity {
  /** The headline: `13,000 L`. */
  stock: string;
  /** The line under it: `of 20,000 L · 65%` (no % without a capacity). */
  detail: string;
}

/** A tank's stock as its headline and its capacity line (#603). */
export function stockOfCapacity(
  stock: number,
  capacity: number | null | undefined,
  unit?: string | null,
  pct?: number | null,
): StockOfCapacity {
  const head = tankQuantity(stock, unit);
  if (!capacity) return { stock: head, detail: '' };
  return {
    stock: head,
    detail: `of ${tankQuantity(capacity, unit)}${pct == null ? '' : ` · ${pct}%`}`,
  };
}
