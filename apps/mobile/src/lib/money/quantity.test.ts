import { describe, expect, it } from 'vitest';
import { wholeQuantityLabel } from './quantity.js';

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
