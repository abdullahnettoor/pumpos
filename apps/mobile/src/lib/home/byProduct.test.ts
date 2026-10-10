import { describe, expect, it } from 'vitest';
import {
  deriveByProduct,
  fuelQuantityLabel,
  groupByCategory,
  MIN_SEGMENT_SHARE,
  unitsLabel,
} from './byProduct.js';
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

describe('groupByCategory (#392)', () => {
  const line = (
    key: string,
    productType: string | null | undefined,
    quantity: number,
    value: number,
  ): ProductLine => ({ key, name: key, productType, quantity, value });

  it('groups several products of several types into one row per category, largest first', () => {
    const rows = groupByCategory([
      line('oil', 'LUBRICANT', 14, 4920),
      line('grease', 'LUBRICANT', 2, 300),
      line('booster', 'ADDITIVE', 6, 1140),
      line('mat', 'ACCESSORY', 3, 780),
      line('wash', 'SERVICE', 4, 400),
    ]);
    expect(rows.map((r) => [r.name, r.quantity, r.value])).toEqual([
      ['Lubricants', 16, 5220],
      ['Additives', 6, 1140],
      ['Accessories', 3, 780],
      ['Service', 4, 400],
    ]);
  });

  it('keeps Other last however large it is, and files unrecognised types there', () => {
    const rows = groupByCategory([
      line('a', 'OTHER', 1, 9000),
      line('b', 'MERCHANDISE', 1, 100),
      line('c', 'CONSUMABLE', 1, 50),
    ]);
    expect(rows.map((r) => [r.name, r.value])).toEqual([
      ['Consumables', 50],
      ['Other', 9100],
    ]);
  });

  it('puts a line with no category under Other when its siblings have one', () => {
    const rows = groupByCategory([line('a', 'LUBRICANT', 1, 500), line('b', undefined, 2, 70)]);
    expect(rows.map((r) => [r.name, r.quantity, r.value])).toEqual([
      ['Lubricants', 1, 500],
      ['Other', 2, 70],
    ]);
  });

  it('falls back to one Products row when no line has a category (a legacy snapshot)', () => {
    const rows = groupByCategory([line('a', undefined, 3, 500), line('b', null, 2, 70)]);
    expect(rows).toEqual([{ key: 'products', name: 'Products', quantity: 5, value: 570 }]);
  });

  it('is empty without lines', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
