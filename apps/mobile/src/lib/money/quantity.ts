/**
 * How a quantity reads on a Money screen. Two shapes, named for what they show:
 *
 *  - `wholeQuantityLabel`: a summary figure (`22,000 L`), rounded to whole units.
 *  - `ledgerQuantityLabel`: a statement row's own quantity (`2.5 L Diesel`),
 *    keeping up to two decimals, optionally naming the product.
 *
 * Both write the unit through `unitLabel`, so a unit typed as `Ltr`, `litres` or
 * `L` reads the same everywhere.
 */
import { unitLabel } from '../home/sales.js';

/** The unit as shown: `L` for any litre spelling; blank stays blank. */
const shownUnit = (unit: string | null | undefined): string => {
  const u = unit?.trim();
  return u ? unitLabel(u) : '';
};

/** `22,000 L` (whole units; litres and nos are never fractional in practice). */
export const wholeQuantityLabel = (quantity: number, unit: string): string =>
  `${Math.round(quantity).toLocaleString('en-IN')} ${shownUnit(unit)}`.trim();

/** The quantity fields of a ledger row. */
export interface LedgerQuantity {
  quantity?: number | string | null;
  unit?: string | null;
  productName?: string | null;
}

/** `120 L Diesel`, `2.5 L Diesel`, `4 Nos Oil 1L`; null when the row has no quantity. */
export function ledgerQuantityLabel(r: LedgerQuantity, withProduct = true): string | null {
  const qty = Number(r.quantity);
  if (r.quantity == null || !Number.isFinite(qty) || qty <= 0) return null;
  const shown = Number(qty.toFixed(2)).toLocaleString('en-IN');
  return [shown, shownUnit(r.unit), withProduct ? r.productName?.trim() : null]
    .filter(Boolean)
    .join(' ');
}
