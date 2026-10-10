import { describe, expect, it } from 'vitest';
import { deriveByProduct, fuelQuantityLabel, MIN_SEGMENT_SHARE, unitsLabel } from './byProduct.js';
import type { FuelLine, ProductLine } from './sales.js';

const fuel = (key: string, value: number, quantity = 100): FuelLine => ({
  key,
  name: key,
  code: '',
  quantity,
  unit: 'L',
  value,
});
const product = (key: string, value: number, quantity = 1): ProductLine => ({
  key,
  name: key,
  quantity,
  value,
});

describe('deriveByProduct', () => {
  it('sums each group and the whole', () => {
    const f = deriveByProduct({
      fuel: [fuel('ms', 1000), fuel('hsd', 500)],
      products: [product('oil', 200, 2), product('coolant', 100, 3)],
    });
    expect(f).toMatchObject({ fuelTotal: 1500, productsTotal: 300, total: 1800, units: 5 });
  });

  it('prefers the totals the caller knows more exactly than the line sums', () => {
    const f = deriveByProduct({
      fuel: [fuel('ms', 1000)],
      products: [product('oil', 200)],
      fuelTotal: 1010,
      productsTotal: 250,
    });
    expect(f).toMatchObject({ fuelTotal: 1010, productsTotal: 250, total: 1260 });
  });

  it('draws a bar segment per fuel grade with value, then one for products', () => {
    const f = deriveByProduct({
      fuel: [fuel('ms', 1000), fuel('hsd', 500)],
      products: [product('oil', 500)],
    });
    expect(f.segments.map((s) => [s.key, s.kind, s.weight])).toEqual([
      ['ms', 'fuel', 1000],
      ['hsd', 'fuel', 500],
      ['products', 'products', 500],
    ]);
  });

  it('keeps a grade swatch tied to its row even when an earlier grade has no sales', () => {
    const f = deriveByProduct({ fuel: [fuel('xp', 0), fuel('ms', 1000)], products: [] });
    expect(f.segments).toEqual([{ key: 'ms', kind: 'fuel', index: 1, weight: 1000 }]);
  });

  it('never draws a product segment thinner than the minimum share', () => {
    const f = deriveByProduct({ fuel: [fuel('ms', 100000)], products: [product('oil', 10)] });
    const seg = f.segments.find((s) => s.kind === 'products')!;
    expect(seg.weight).toBeCloseTo(f.total * MIN_SEGMENT_SHARE);
  });

  it('draws no bar without sales', () => {
    expect(deriveByProduct({ fuel: [fuel('ms', 0)], products: [] }).segments).toEqual([]);
  });
});

describe('labels', () => {
  it('pluralises units to at most two decimals', () => {
    expect(unitsLabel(1)).toBe('1 unit');
    expect(unitsLabel(1.504)).toBe('1.5 units');
    expect(unitsLabel(12)).toBe('12 units');
  });
  it('groups fuel quantity in en-IN', () => {
    expect(fuelQuantityLabel({ quantity: 123456.4, unit: 'L' })).toBe('1,23,456 L');
  });
});
