import type { ProfitLossProductMargin } from '../../../services/cloud.js';

/** The fields of a catalogue product the unit lookup reads. */
export interface CatalogueProduct {
  id: string | number;
  unit?: string | null;
}

/**
 * The unit each P&L margin row's quantity is in (#531). The P&L carries no
 * unit, so it comes from the product catalogue by product id. A product the
 * catalogue does not have (not loaded yet, archived) falls back by kind: fuel
 * in litres, merchandise in pieces. Quantities in different units are never
 * added: the Table module totals a mixed-unit column as `—`.
 */
export function productUnits(
  products: readonly CatalogueProduct[] | null | undefined,
): (row: Pick<ProfitLossProductMargin, 'productId' | 'kind'>) => string {
  const byId = new Map<string, string>();
  for (const p of products ?? []) {
    const unit = p.unit?.trim();
    if (unit) byId.set(String(p.id), unit);
  }
  return (row) => byId.get(String(row.productId)) ?? (row.kind === 'fuel' ? 'L' : 'Nos');
}
