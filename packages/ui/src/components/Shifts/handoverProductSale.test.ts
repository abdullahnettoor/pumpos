import { describe, expect, it } from 'vitest';
import {
  cashToDrawer,
  handoverProductSaleSchema,
  draftTotals,
  hasMrp,
  lineTax,
  linesWithoutMrp,
  mrpLabel,
  noMrpReason,
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

describe('a product with no MRP (#638)', () => {
  const noMrp = { sellingPrice: null, taxCategory: 'GST' };
  const zero = { sellingPrice: '0', taxCategory: 'GST' };
  const products = { oil, noMrp, zero };

  it('has an MRP only above zero, as the server requires', () => {
    expect(hasMrp(oil)).toBe(true);
    expect(hasMrp(coolant)).toBe(true);
    expect(hasMrp(noMrp)).toBe(false);
    expect(hasMrp(zero)).toBe(false);
    expect(hasMrp(undefined)).toBe(false);
  });

  it('labels a product in the picker by its MRP, or says it has none', () => {
    const fmt = (v: number | string) => `₹${Number(v).toFixed(2)}`;
    expect(mrpLabel(oil, fmt)).toBe('MRP ₹450.00');
    expect(mrpLabel(noMrp, fmt)).toBe('No price set');
    expect(mrpLabel(zero, fmt)).toBe('No price set');
  });

  it('finds the lines whose product has no MRP, not blank ones', () => {
    expect(
      linesWithoutMrp(
        [
          { productId: 'oil', quantity: '1' },
          { productId: 'noMrp', quantity: '' },
          { productId: '', quantity: '2' },
          { productId: 'zero', quantity: '1' },
        ],
        products,
      ),
    ).toEqual([1, 3]);
  });

  it('says why Save is off, and who can fix it', () => {
    expect(noMrpReason(0, true)).toBeNull();
    expect(noMrpReason(1, true)).toBe('An item has no MRP. Use Set MRP on it first.');
    expect(noMrpReason(2, false)).toBe(
      '2 items have no MRP. Ask your Owner or Manager to set an MRP.',
    );
  });

  it('refuses a sale with a line that has no MRP, like the server', () => {
    const schema = handoverProductSaleSchema(
      (lines) => draftTotals(lines, products).total,
      (lines) => linesWithoutMrp(lines, products),
    );
    const r = schema.safeParse({
      attendantId: 'u1',
      lines: [
        { productId: 'oil', quantity: '1' },
        { productId: 'noMrp', quantity: '1' },
      ],
      nonCash: '',
    });
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toEqual([
      'Set an MRP for every item first.',
    ]);
  });
});
