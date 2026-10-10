import { describe, expect, it } from 'vitest';
import { ledgerQuantityLabel, wholeQuantityLabel } from './quantity.js';

describe('wholeQuantityLabel', () => {
  it('rounds to whole units and groups the digits', () => {
    expect(wholeQuantityLabel(22000.4, 'L')).toBe('22,000 L');
    expect(wholeQuantityLabel(1250000, 'L')).toBe('12,50,000 L');
  });

  it('writes every litre spelling as L and leaves other units alone', () => {
    expect(wholeQuantityLabel(5, 'Ltr')).toBe('5 L');
    expect(wholeQuantityLabel(5, 'litres')).toBe('5 L');
    expect(wholeQuantityLabel(5, 'Nos')).toBe('5 Nos');
    expect(wholeQuantityLabel(5, '')).toBe('5');
  });
});

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
