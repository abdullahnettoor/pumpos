import { describe, expect, it } from 'vite-plus/test';
import {
  isBalancedQuantity,
  isStockVarianceWithinTolerance,
  QUANTITY_EPSILON,
  STOCK_VARIANCE_TOLERANCE_PCT,
  STOCK_VARIANCE_TOLERANCE_KEY,
  resolveStockVarianceTolerance,
  stockVarianceToleranceChanged,
  stockVarianceTolerancePctSchema,
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
  it('uses the supplied limit, including its boundary and zero', () => {
    expect(isStockVarianceWithinTolerance(-9, 1000, 1)).toBe(true);
    expect(isStockVarianceWithinTolerance(10, 1000, 1)).toBe(true);
    expect(isStockVarianceWithinTolerance(-10, 1000, 1)).toBe(true);
    expect(isStockVarianceWithinTolerance(10.001, 1000, 1)).toBe(false);
    expect(isStockVarianceWithinTolerance(-10.001, 1000, 1)).toBe(false);
    expect(isStockVarianceWithinTolerance(0.001, 1000, 0)).toBe(false);
    expect(isStockVarianceWithinTolerance(0, 0, 1)).toBe(true);
    expect(isStockVarianceWithinTolerance(1, null, 1)).toBe(false);
  });
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

describe('Station tank variance limit', () => {
  it('resolves valid settings and falls back for missing or invalid values', () => {
    expect(STOCK_VARIANCE_TOLERANCE_KEY).toBe('stock_variance_tolerance_pct');
    expect(resolveStockVarianceTolerance(undefined)).toBe(0.5);
    expect(resolveStockVarianceTolerance({})).toBe(0.5);
    expect(resolveStockVarianceTolerance({ stock_variance_tolerance_pct: 0 })).toBe(0);
    expect(resolveStockVarianceTolerance({ stock_variance_tolerance_pct: 5 })).toBe(5);
    expect(resolveStockVarianceTolerance({ stock_variance_tolerance_pct: 'bad' })).toBe(0.5);
    expect(resolveStockVarianceTolerance({ stock_variance_tolerance_pct: 0.005 })).toBe(0.5);
  });
  it('validates the range and precision', () => {
    for (const value of [-0.1, 5.01, 0.005, 'abc', Infinity]) {
      expect(stockVarianceTolerancePctSchema.safeParse(value).success).toBe(false);
    }
    for (const value of [0, 0.25, 0.5, 5]) {
      expect(stockVarianceTolerancePctSchema.safeParse(value).success).toBe(true);
    }
  });
  it('compares raw values with missing treated as the default', () => {
    expect(stockVarianceToleranceChanged(undefined, 0.5)).toBe(false);
    expect(stockVarianceToleranceChanged(0.25, 0.25)).toBe(false);
    expect(stockVarianceToleranceChanged(0.5, 1)).toBe(true);
    expect(stockVarianceToleranceChanged(0.5, 'abc')).toBe(true);
  });
});
