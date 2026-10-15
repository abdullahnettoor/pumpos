import { describe, expect, it } from 'vitest';
import {
  cashToDrawer,
  handoverProductSaleSchema,
  draftTotals,
  lineTax,
  saleLines,
} from './handoverProductSale.js';

const oil = { sellingPrice: 450, taxCategory: 'GST', taxConfig: { gst_rate: 18 } };
const coolant = { sellingPrice: '150', taxCategory: 'GST', taxConfig: { gst_rate: 18 } };
const exclusive = {
  sellingPrice: 100,
  taxCategory: 'GST',
  taxConfig: { gst_rate: 18, price_inclusive: false },
};
const exempt = { sellingPrice: 80, taxCategory: 'EXEMPT' };

describe('lineTax', () => {
  it('splits a tax-inclusive price into taxable and tax', () => {
    expect(lineTax(oil, 1)).toEqual({ taxable: 381.36, tax: 68.64, total: 450 });
  });
  it('adds tax on top of an exclusive price', () => {
    expect(lineTax(exclusive, 2)).toEqual({ taxable: 200, tax: 36, total: 236 });
  });
  it('has no tax for an exempt product, and nothing for an unpriced one', () => {
    expect(lineTax(exempt, 3)).toEqual({ taxable: 240, tax: 0, total: 240 });
    expect(lineTax({}, 3)).toEqual({ taxable: 0, tax: 0, total: 0 });
  });
});

describe('draftTotals', () => {
  it('sums only lines with a product and a quantity, in paise', () => {
    const rows = [
      { productId: 'oil', quantity: '1' },
      { productId: 'cool', quantity: '2' },
      { productId: '', quantity: '5' },
      { productId: 'oil', quantity: '0' },
    ];
    expect(saleLines(rows)).toEqual([
      { productId: 'oil', quantity: 1 },
      { productId: 'cool', quantity: 2 },
    ]);
    expect(draftTotals(rows, { oil, cool: coolant })).toEqual({
      taxable: 635.6,
      tax: 114.4,
      total: 750,
    });
  });
});

describe('cashToDrawer', () => {
  it('is the total less the card/UPI part, never below zero', () => {
    expect(cashToDrawer(750, 300.1)).toBe(449.9);
    expect(cashToDrawer(100, 200)).toBe(0);
  });
});

describe('handoverProductSaleSchema', () => {
  const schema = handoverProductSaleSchema((lines) => draftTotals(lines, { oil }).total);
  const lines = [{ productId: 'oil', quantity: '1' }];
  const errorOf = (v: Record<string, unknown>) => {
    const r = schema.safeParse({ attendantId: 'u1', lines, nonCash: '', ...v });
    return r.success ? null : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };

  it('asks for the employee, then a line, then a card/UPI part within the total', () => {
    expect(errorOf({ attendantId: '' })).toEqual([
      'attendantId: Select the employee who made the sales.',
    ]);
    expect(errorOf({ lines: [{ productId: '', quantity: '2' }] })).toEqual([
      'lines: Add at least one product with a quantity.',
    ]);
    expect(errorOf({ nonCash: '450.01' })).toEqual([
      'nonCash: The card/UPI part cannot be more than the sale total.',
    ]);
    expect(errorOf({ nonCash: 'abc' })?.[0]).toMatch(/as an amount/);
    expect(errorOf({ nonCash: '450' })).toBeNull();
    expect(errorOf({})).toBeNull();
  });
});
