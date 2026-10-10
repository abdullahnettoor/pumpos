import { describe, expect, it } from 'vitest';
import { composeShiftProductSales } from './compose-shift-sales.js';

describe('composeShiftProductSales', () => {
  it('keeps product category and display category on the Shift Summary line', () => {
    expect(
      composeShiftProductSales(
        [
          {
            productId: 'p1',
            productName: 'Engine Oil',
            productType: 'LUBRICANT',
            category: 'Motor Oils',
            quantity: '2.5',
            lineTotal: '1680.129',
          },
        ],
        1800,
      ),
    ).toEqual({
      total: 1800,
      lines: [
        {
          productId: 'p1',
          productName: 'Engine Oil',
          productType: 'LUBRICANT',
          category: 'Motor Oils',
          quantity: 2.5,
          value: 1680.13,
        },
      ],
    });
  });

  it('normalizes missing category data on legacy lines to OTHER', () => {
    expect(
      composeShiftProductSales(
        [{ productId: 'p1', productName: 'Product', quantity: 1, lineTotal: 10 }],
        10,
      ),
    ).toEqual({
      total: 10,
      lines: [
        {
          productId: 'p1',
          productName: 'Product',
          productType: 'OTHER',
          category: null,
          quantity: 1,
          value: 10,
        },
      ],
    });
  });
});
