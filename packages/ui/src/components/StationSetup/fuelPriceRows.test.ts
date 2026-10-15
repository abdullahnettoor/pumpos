import { describe, expect, it } from 'vitest';
import { buildFuelPriceRows } from './fuelPriceRows.js';

const unit = (id: string) => (id === 'cng' ? 'kg' : undefined);

describe('buildFuelPriceRows', () => {
  it('reads the last change from the two latest history entries, whatever their order', () => {
    const rows = buildFuelPriceRows(
      [
        {
          productId: 'ms',
          productName: 'Petrol',
          productCode: 'MS',
          price: '102.5',
          effectiveFrom: '2026-10-10T00:30:00Z',
        },
      ],
      [
        { id: '1', productId: 'ms', price: '99', effectiveFrom: '2026-01-01T00:00:00Z' },
        { id: '3', productId: 'ms', price: '102.5', effectiveFrom: '2026-10-10T00:30:00Z' },
        { id: '2', productId: 'ms', price: '101', effectiveFrom: '2026-06-01T00:00:00Z' },
      ],
      unit,
    );
    expect(rows).toEqual([
      {
        productId: 'ms',
        productName: 'Petrol',
        productCode: 'MS',
        unit: 'L',
        price: 102.5,
        effectiveFrom: '2026-10-10T00:30:00Z',
        lastChange: { from: 101, to: 102.5 },
      },
    ]);
  });

  it('has no last change with one price, and no price before the first', () => {
    const rows = buildFuelPriceRows(
      [
        { productId: 'cng', productName: 'CNG', price: 80, effectiveFrom: '2026-01-01T00:00:00Z' },
        { productId: 'xp', productName: 'XP95', price: 0, effectiveFrom: null },
      ],
      [{ id: '1', productId: 'cng', price: 80, effectiveFrom: '2026-01-01T00:00:00Z' }],
      unit,
    );
    expect(rows.map((r) => [r.unit, r.price, r.lastChange])).toEqual([
      ['kg', 80, null],
      ['L', null, null],
    ]);
  });
});
