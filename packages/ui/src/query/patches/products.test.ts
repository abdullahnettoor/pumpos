import { describe, expect, it } from 'vitest';
import { withProductPrice } from './products.js';

describe('withProductPrice (#638)', () => {
  const list = [
    { id: 'p-oil', name: 'Engine oil', sellingPrice: 450 },
    { id: 'p-cool', name: 'Coolant', sellingPrice: null },
  ];

  it('writes the answered MRP onto that product only', () => {
    expect(withProductPrice(list, { id: 'p-cool', sellingPrice: '150.00' })).toEqual([
      list[0],
      { id: 'p-cool', name: 'Coolant', sellingPrice: '150.00' },
    ]);
  });

  it('clears an MRP the answer clears', () => {
    expect(withProductPrice(list, { id: 'p-oil', sellingPrice: null })[0].sellingPrice).toBeNull();
  });

  it('returns the same list when there is nothing to change', () => {
    expect(withProductPrice(list, { id: 'p-x', sellingPrice: 10 })).toBe(list);
    expect(withProductPrice(list, { id: 'p-oil', sellingPrice: 450 })).toBe(list);
  });
});
