import { describe, expect, it } from 'vitest';
import { composeDssr } from './compose.js';
import type { DssrSourceData } from './ports.js';

const emptySource = (overrides: Partial<DssrSourceData> = {}): DssrSourceData => ({
  shiftSummaries: [],
  purchases: [],
  sales: [],
  creditSales: [],
  stockVariances: [],
  saleItems: [],
  products: {},
  nozzles: {},
  ...overrides,
});

describe('composeDssr document counts and per-shift fuel value (#391)', () => {
  it('counts credit slips and purchases alongside their totals', () => {
    const d = composeDssr(
      emptySource({
        creditSales: [
          { customerType: 'Fleet', amount: 4000 },
          { customerType: 'Regular', amount: 1000 },
          { customerType: 'Fleet', amount: 500 },
        ],
        purchases: [{ amount: 450000 }, { amount: 1200 }],
      }),
    ) as any;
    expect(d.credit).toMatchObject({ total: 5500, count: 3 });
    expect(d.purchases).toEqual({ total: 451200, count: 2 });
  });

  it('reports zero counts for a day with no credit sales or purchases', () => {
    const d = composeDssr(emptySource()) as any;
    expect(d.credit.count).toBe(0);
    expect(d.purchases.count).toBe(0);
  });

  it("carries each closed shift's fuel sales value so a later day can compare shift by shift", () => {
    const d = composeDssr(
      emptySource({
        shiftSummaries: [
          {
            shiftId: 'sh-1',
            shiftSequence: 1,
            snapshot: { totalNetVolume: 980, totalFuelSalesValue: 98000 },
          },
          {
            shiftId: 'sh-2',
            shiftSequence: 2,
            snapshot: { totalNetVolume: 500, totalFuelSalesValue: 51000.5 },
          },
        ],
      }),
    ) as any;
    expect(d.shifts.map((s: any) => s.fuelSalesValue)).toEqual([98000, 51000.5]);
    expect(d.fuel.totalSalesValue).toBe(149000.5);
  });
});
