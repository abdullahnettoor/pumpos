/**
 * How a quantity reads on a ledger row. The unit is written through
 * `unitLabel`, so a unit typed as `Ltr`, `litres` or `L` reads the same
 * everywhere (Home, Shift Summary, the Money statement and its PDF).
 */

/** The unit as shown: `L` for any litre spelling, `kg` for kilograms; blank reads as litres. */
export const unitLabel = (unit: unknown): string => {
  const u = typeof unit === 'string' ? unit.trim() : '';
  if (!u || /^(l|ltr|litre|liter)s?$/i.test(u)) return 'L';
  if (/^(kg|kilogram)s?$/i.test(u)) return 'kg';
  return u;
};

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
  const unit = r.unit?.trim() ? unitLabel(r.unit) : '';
  return [shown, unit, withProduct ? r.productName?.trim() : null].filter(Boolean).join(' ');
}
