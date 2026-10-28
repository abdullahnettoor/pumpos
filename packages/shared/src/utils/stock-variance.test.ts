import { describe, expect, it } from 'vite-plus/test';
import {
  isBalancedQuantity,
  isStockVarianceWithinTolerance,
  QUANTITY_EPSILON,
  STOCK_VARIANCE_TOLERANCE_PCT,
} from './stock-variance.js';

describe('isBalancedQuantity: the one balanced rule for quantities', () => {
  it('is half the recorded step (3 decimals): half a millilitre', () => {
    expect(QUANTITY_EPSILON).toBe(0.0005);
  });
  it('reads float noise and anything under half a millilitre as balanced, either way', () => {
    expect(isBalancedQuantity(0)).toBe(true);
    expect(isBalancedQuantity(-0)).toBe(true);
    expect(isBalancedQuantity(0.1 + 0.2 - 0.3)).toBe(true);
    expect(isBalancedQuantity(0.0004)).toBe(true);
    expect(isBalancedQuantity(-0.0004)).toBe(true);
    expect(isBalancedQuantity(0.000499)).toBe(true);
  });
  it('is off from half a millilitre: the smallest recorded step is a real variance', () => {
    expect(isBalancedQuantity(0.0005)).toBe(false);
    expect(isBalancedQuantity(-0.0005)).toBe(false);
    expect(isBalancedQuantity(0.001)).toBe(false);
    expect(isBalancedQuantity(-0.001)).toBe(false);
    expect(isBalancedQuantity(0.004)).toBe(false);
    expect(isBalancedQuantity(-1)).toBe(false);
  });
});

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
  it('reads a balanced variance (isBalancedQuantity) as zero when nothing was sold', () => {
    expect(isStockVarianceWithinTolerance(0.0004, 0)).toBe(true);
    expect(isStockVarianceWithinTolerance(-0.0004, null)).toBe(true);
    expect(isStockVarianceWithinTolerance(0.001, 0)).toBe(false);
  });
});
