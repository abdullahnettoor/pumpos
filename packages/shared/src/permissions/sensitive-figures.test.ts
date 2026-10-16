import { describe, expect, it } from 'vitest';
import { principalOf } from './catalogue.js';
import { redactPurchaseCosts, redactSensitiveDssr } from './sensitive-figures.js';

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
