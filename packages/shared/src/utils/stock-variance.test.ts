import { describe, expect, it } from 'vitest';
import { isStockVarianceWithinTolerance, STOCK_VARIANCE_TOLERANCE_PCT } from './stock-variance.js';

describe('isStockVarianceWithinTolerance', () => {
  it('allows a variance up to the tolerance share of litres sold, in either direction', () => {
    const limit = (20000 * STOCK_VARIANCE_TOLERANCE_PCT) / 100; // 100 L
    expect(isStockVarianceWithinTolerance(-limit, 20000)).toBe(true);
    expect(isStockVarianceWithinTolerance(limit, 20000)).toBe(true);
    expect(isStockVarianceWithinTolerance(-limit - 0.5, 20000)).toBe(false);
    expect(isStockVarianceWithinTolerance(limit + 0.5, 20000)).toBe(false);
  });
  it('scales with what the tank sold: the same 18 L is fine on 4,000 L and not on 1,000 L', () => {
    expect(isStockVarianceWithinTolerance(-18, 4000)).toBe(true);
    expect(isStockVarianceWithinTolerance(-18, 1000)).toBe(false);
  });
  it('allows only a zero variance when nothing was sold or sales are unknown', () => {
    expect(isStockVarianceWithinTolerance(0, 0)).toBe(true);
    expect(isStockVarianceWithinTolerance(-1, 0)).toBe(false);
    expect(isStockVarianceWithinTolerance(0, null)).toBe(true);
    expect(isStockVarianceWithinTolerance(5, null)).toBe(false);
  });
});
