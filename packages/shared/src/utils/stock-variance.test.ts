import { describe, expect, it } from 'vitest';
import { isStockVarianceWithinTolerance, STOCK_VARIANCE_TOLERANCE_PCT } from './stock-variance.js';

describe('isStockVarianceWithinTolerance', () => {
  it('allows up to the tolerance share of litres sold, loss or gain alike', () => {
    const limit = (20000 * STOCK_VARIANCE_TOLERANCE_PCT) / 100;
    expect(isStockVarianceWithinTolerance(-limit, 20000)).toBe(true);
    expect(isStockVarianceWithinTolerance(limit, 20000)).toBe(true);
    expect(isStockVarianceWithinTolerance(-(limit + 0.01), 20000)).toBe(false);
    expect(isStockVarianceWithinTolerance(limit + 0.01, 20000)).toBe(false);
  });

  it('a tank that sold nothing is within tolerance only with no variance', () => {
    expect(isStockVarianceWithinTolerance(0, 0)).toBe(true);
    expect(isStockVarianceWithinTolerance(-1, 0)).toBe(false);
  });
});
