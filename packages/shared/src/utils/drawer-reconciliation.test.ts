import { describe, expect, it } from 'vitest';
import { reconcileDrawer, type DrawerReconciliationInput } from './drawer-reconciliation.js';

const input = (over: Partial<DrawerReconciliationInput> = {}): DrawerReconciliationInput => ({
  openingFloat: 0,
  expectedFuelSales: 0,
  merchandiseCash: 0,
  cardHandedOver: 0,
  upiHandedOver: 0,
  creditSales: 0,
  omcCardSales: 0,
  cashHandedOver: 0,
  cashDrops: 0,
  ...over,
});

describe('reconcileDrawer', () => {
  it('expects float + cash sales − drops in the pouch', () => {
    const r = reconcileDrawer(
      input({
        openingFloat: 2000,
        expectedFuelSales: 5000,
        merchandiseCash: 400,
        cardHandedOver: 1000,
        upiHandedOver: 500,
        creditSales: 700,
        omcCardSales: 300,
        cashDrops: 500,
        cashHandedOver: 4400,
      }),
    );
    expect(r).toEqual({
      expectedTotal: 5400,
      nonCash: 2500,
      declaredTotal: 6900,
      cashSales: 2900,
      expectedCash: 4400,
      varianceAmount: 0,
    });
  });

  it('reports a shortage as negative and an overage as positive', () => {
    const base = { expectedFuelSales: 5000, cashHandedOver: 4875 };
    expect(reconcileDrawer(input(base)).varianceAmount).toBe(-125);
    expect(reconcileDrawer(input({ ...base, cashHandedOver: 5100 })).varianceAmount).toBe(100);
  });

  it('counts the float and drops in the variance, not in the declared total', () => {
    const r = reconcileDrawer(
      input({ openingFloat: 2000, expectedFuelSales: 5000, cashDrops: 500, cashHandedOver: 6500 }),
    );
    expect(r.varianceAmount).toBe(0);
    expect(r.declaredTotal).toBe(6500);
  });

  it('rounds to the paisa and never returns -0', () => {
    const r = reconcileDrawer(input({ expectedFuelSales: 0.1 + 0.2, cashHandedOver: 0.3 }));
    expect(r.varianceAmount).toBe(0);
    expect(Object.is(r.varianceAmount, -0)).toBe(false);
    expect(r.expectedCash).toBe(0.3);
  });
});
