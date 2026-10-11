import { describe, expect, it } from 'vitest';
import {
  composeShiftPayments,
  composeShiftProductSales,
  composeShiftTotalSales,
} from './compose-shift-sales.js';

describe('composeShiftProductSales', () => {
  it('groups by product id, so two products with one name stay apart', () => {
    const out = composeShiftProductSales(
      [
        {
          productId: 'p1',
          productName: 'Engine Oil',
          productType: 'LUBRICANT',
          quantity: 2,
          lineTotal: 600,
        },
        {
          productId: 'p2',
          productName: 'Engine Oil',
          productType: 'ACCESSORY',
          quantity: 1,
          lineTotal: 450,
        },
        {
          productId: 'p1',
          productName: 'Engine Oil',
          productType: 'LUBRICANT',
          quantity: '1',
          lineTotal: '300',
        },
      ],
      1416,
    );
    expect(out.lines).toEqual([
      {
        productId: 'p1',
        productName: 'Engine Oil',
        productType: 'LUBRICANT',
        quantity: 3,
        value: 900,
      },
      {
        productId: 'p2',
        productName: 'Engine Oil',
        productType: 'ACCESSORY',
        quantity: 1,
        value: 450,
      },
    ]);
    // The total is the sales' own total (tax included), not the line sum.
    expect(out.total).toBe(1416);
  });

  it('carries each line product type, several products across several types', () => {
    const out = composeShiftProductSales(
      [
        {
          productId: 'a',
          productName: 'Oil',
          productType: 'LUBRICANT',
          quantity: 1,
          lineTotal: 500,
        },
        {
          productId: 'b',
          productName: 'Booster',
          productType: 'ADDITIVE',
          quantity: 2,
          lineTotal: 300,
        },
        {
          productId: 'c',
          productName: 'Mat',
          productType: 'ACCESSORY',
          quantity: 1,
          lineTotal: 200,
        },
        {
          productId: 'd',
          productName: 'Grease',
          productType: 'LUBRICANT',
          quantity: 1,
          lineTotal: 100,
        },
      ],
      1100,
    );
    expect(out.lines.map((l) => [l.productName, l.productType])).toEqual([
      ['Oil', 'LUBRICANT'],
      ['Booster', 'ADDITIVE'],
      ['Mat', 'ACCESSORY'],
      ['Grease', 'LUBRICANT'],
    ]);
  });

  it('has a null product type for a product the catalogue no longer resolves', () => {
    const out = composeShiftProductSales(
      [{ productId: 'x', productName: null, quantity: 1, lineTotal: 10 }],
      10,
    );
    expect(out.lines[0]).toMatchObject({ productName: 'Product', productType: null });
  });

  it('reads an unrecognised product type as Other', () => {
    const out = composeShiftProductSales(
      [
        {
          productId: 'x',
          productName: 'X',
          productType: 'MERCHANDISE',
          quantity: 1,
          lineTotal: 10,
        },
      ],
      10,
    );
    expect(out.lines[0]?.productType).toBe('OTHER');
  });

  it('is empty for a Shift with no Product Sales', () => {
    expect(composeShiftProductSales([], 0)).toEqual({ total: 0, lines: [] });
  });
});

describe('composeShiftPayments', () => {
  const handovers = [
    { upiHandedOver: '100.5', cardHandedOver: '40', creditHandedOver: '10' },
    { upiHandedOver: 50, cardHandedOver: '0', creditHandedOver: '5' },
  ];

  it('sums card and UPI from Handovers and takes credit from the credit sales', () => {
    expect(
      composeShiftPayments({
        cashSales: 1234.5,
        handovers,
        creditSalesTotal: 900,
        omcCardTotal: 0,
      }),
    ).toEqual({
      cash: 1234.5,
      upi: 150.5,
      card: 40,
      credit: 900,
      omcCard: 0,
    });
  });

  it('falls back to the Handovers credit when the Shift has no credit sale rows', () => {
    expect(
      composeShiftPayments({ cashSales: 0, handovers, creditSalesTotal: 0, omcCardTotal: 0 })
        .credit,
    ).toBe(15);
  });

  it('carries the OMC Card Sales total as its own bucket', () => {
    expect(
      composeShiftPayments({ cashSales: 0, handovers, creditSalesTotal: 0, omcCardTotal: 2000.004 })
        .omcCard,
    ).toBe(2000);
  });
});

describe('composeShiftTotalSales', () => {
  it('is fuel plus Product Sales', () => {
    expect(composeShiftTotalSales(2360.1, 1416.2)).toBe(3776.3);
  });
});
