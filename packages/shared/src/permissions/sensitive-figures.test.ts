import { describe, expect, it } from 'vitest';
import { principalOf } from './catalogue.js';
import {
  redactPurchaseCosts,
  redactSensitiveDssr,
  redactProductCosts,
  redactStockLoss,
} from './sensitive-figures.js';

const row = () => ({
  businessDate: '2026-01-01',
  snapshotData: {
    pnl: { revenue: 100, cogs: 70, grossMargin: 30, byProduct: [{ margin: 1 }] },
    purchases: { total: 50, count: 2 },
  },
});

describe('redactSensitiveDssr', () => {
  it('leaves the figures for a principal that holds both', () => {
    const p = { role: 'Owner' as const };
    expect(redactSensitiveDssr(row(), p)).toEqual(row());
  });
  it('strips margin when View margin is missing, keeping revenue', () => {
    const out = redactSensitiveDssr(row(), principalOf('Manager'));
    expect(out.snapshotData.pnl).toEqual({ revenue: 100 });
    expect(out.snapshotData.purchases.total).toBe(50);
  });
  it('strips purchase costs when View purchase prices / costs is revoked', () => {
    const perms = principalOf('Owner').permissions;
    const p = {
      role: 'Manager' as const,
      permissions: [...(perms ?? [])].filter((x) => x !== 'purchases.viewCosts'),
    };
    const out = redactSensitiveDssr(row(), p);
    expect(out.snapshotData.purchases).toEqual({ count: 2 });
  });
  it('handles null and rows without a snapshot', () => {
    expect(redactSensitiveDssr(null, { role: 'Manager' })).toBeNull();
  });
});

describe('redactPurchaseCosts', () => {
  const line = { id: 'p', quantity: '10', unitPrice: '90.5', lineTotal: '905', amount: '905' };
  it('nulls prices and totals but keeps quantities for a principal without View costs', () => {
    expect(redactPurchaseCosts(line, { role: 'Staff' })).toEqual({
      id: 'p',
      quantity: '10',
      unitPrice: null,
      lineTotal: null,
      amount: null,
    });
  });
  it('returns the row untouched when allowed', () => {
    expect(redactPurchaseCosts(line, principalOf('Accountant'))).toBe(line);
  });
});

describe('unit-cost figures', () => {
  const noCosts = {
    role: 'Manager' as const,
    permissions: [...(principalOf('Owner').permissions ?? [])].filter(
      (x) => x !== 'purchases.viewCosts',
    ),
  };
  it('nulls the variance unitCost in a DSSR without View costs', () => {
    const r = {
      snapshotData: {
        fuelStockVariance: [{ tankName: 'T1', varianceQuantity: -2, unitCost: 90 }],
        merchandiseStockVariance: [{ varianceQuantity: 1, unitCost: 5 }],
      },
    };
    const out = redactSensitiveDssr(r, noCosts) as any;
    expect(out.snapshotData.fuelStockVariance[0]).toEqual({ tankName: 'T1', varianceQuantity: -2 });
    expect(out.snapshotData.merchandiseStockVariance[0]).toEqual({ varianceQuantity: 1 });
    expect(redactSensitiveDssr(r, principalOf('Owner'))).toEqual(r);
  });
  it('strips costBasis from products', () => {
    expect(redactProductCosts([{ id: 'p', costBasis: '9' }], noCosts)).toEqual([{ id: 'p' }]);
    const l = [{ id: 'p', costBasis: '9' }];
    expect(redactProductCosts(l, principalOf('Owner'))).toBe(l);
  });
  it('nulls valueAtCost in stock loss', () => {
    const l = [{ tankId: 't', valueAtCost: 10 }];
    expect(redactStockLoss(l, noCosts)).toEqual([{ tankId: 't', valueAtCost: null }]);
    expect(redactStockLoss(l, principalOf('Owner'))).toBe(l);
  });
});
