import { describe, expect, it } from 'vitest';
import { ledgerQuantityLabel } from './ledgerQuantity.js';

describe('ledgerQuantityLabel', () => {
  it('keeps up to two decimals and names the product', () => {
    expect(ledgerQuantityLabel({ quantity: '2.5', unit: 'L', productName: 'Diesel' })).toBe(
      '2.5 L Diesel',
    );
    expect(ledgerQuantityLabel({ quantity: 120, unit: 'Nos', productName: 'Oil 1L' })).toBe(
      '120 Nos Oil 1L',
    );
  });

  it('can leave the product out', () => {
    expect(ledgerQuantityLabel({ quantity: 120, unit: 'Ltr', productName: 'Diesel' }, false)).toBe(
      '120 L',
    );
  });

  it('is null without a positive quantity', () => {
    expect(ledgerQuantityLabel({ quantity: null, unit: 'L' })).toBeNull();
    expect(ledgerQuantityLabel({ quantity: 0, unit: 'L' })).toBeNull();
    expect(ledgerQuantityLabel({ quantity: 'x', unit: 'L' })).toBeNull();
  });
});
