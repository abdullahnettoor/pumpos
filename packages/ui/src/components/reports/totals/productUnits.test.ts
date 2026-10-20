import { describe, expect, it } from 'vite-plus/test';
import { totalCells, type TableColumn } from '../../../pump-ds/table/columns.js';
import type { ProfitLossProductMargin } from '../../../services/cloud.js';
import { productUnits } from './productUnits.js';

const row = (productId: string, kind: string, quantity = 1) =>
  ({ productId, kind, quantity }) as ProfitLossProductMargin;

describe('productUnits (#531)', () => {
  const unitOf = productUnits([
    { id: 'diesel', unit: 'L' },
    { id: 'oil', unit: 'Nos' },
    { id: 'grease', unit: 'kg' },
    { id: 'blank', unit: ' ' },
  ]);

  it('reads the unit from the catalogue by product id', () => {
    expect(unitOf(row('diesel', 'fuel'))).toBe('L');
    expect(unitOf(row('grease', 'merchandise'))).toBe('kg');
  });

  it('falls back by kind for a product the catalogue does not have, or has no unit for', () => {
    expect(unitOf(row('archived-fuel', 'fuel'))).toBe('L');
    expect(unitOf(row('archived-oil', 'merchandise'))).toBe('Nos');
    expect(unitOf(row('blank', 'merchandise'))).toBe('Nos');
    expect(productUnits(undefined)(row('diesel', 'fuel'))).toBe('L');
  });

  it('never adds quantities in different units: a mixed column totals —', () => {
    const qty: TableColumn<ProfitLossProductMargin> = {
      id: 'quantity',
      header: 'Qty',
      kind: 'qty',
      value: (p) => p.quantity,
      unit: unitOf,
    };
    const mixed = totalCells(
      [qty],
      [row('diesel', 'fuel', 10), row('oil', 'merchandise', 2)],
      true,
    );
    expect(mixed?.[0]).toBe('—');
    const same = totalCells([qty], [row('diesel', 'fuel', 10), row('x', 'fuel', 5)], true);
    expect(String(same?.[0])).toContain('15');
  });
});
