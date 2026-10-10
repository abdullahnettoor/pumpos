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

  it('emits null, not 0, for a shift summary that recorded no fuel sales value', () => {
    const d = composeDssr(
      emptySource({
        shiftSummaries: [
          { shiftId: 'sh-1', shiftSequence: 1, snapshot: { totalNetVolume: 980 } },
          {
            shiftId: 'sh-2',
            shiftSequence: 2,
            snapshot: { totalNetVolume: 10, totalFuelSalesValue: 0 },
          },
        ],
      }),
    ) as any;
    expect(d.shifts.map((s: any) => s.fuelSalesValue)).toEqual([null, 0]);
    expect(d.fuel.totalSalesValue).toBe(0);
  });
});

describe('composeDssr tank stock movement (#395)', () => {
  const dip = {
    tankName: 'Tank 1',
    productName: 'Petrol',
    unit: 'Litre',
    inventoryType: 'BULK',
    expectedQuantity: 14820,
    actualQuantity: 14802,
    varianceQuantity: -18,
    reason: null,
  };

  it("derives the tank's closing book from its opening, receipts, sales and adjustments", () => {
    const d = composeDssr(
      emptySource({
        stockVariances: [
          {
            ...dip,
            tankMovement: {
              tankId: 't1',
              openingQuantity: 12000,
              receivedQuantity: 5000,
              soldQuantity: 2210.5,
              adjustedQuantity: 30.5,
            },
          },
        ],
      }),
    ) as any;
    expect(d.fuelStockVariance[0].tankMovement).toEqual({
      tankId: 't1',
      openingQuantity: 12000,
      receivedQuantity: 5000,
      soldQuantity: 2210.5,
      adjustedQuantity: 30.5,
      closingQuantity: 14820,
    });
    expect(d.fuelStockVariance[0]).toMatchObject({ status: 'Loss', varianceQuantity: -18 });
  });

  it('leaves a dip with no movement exactly as before', () => {
    const d = composeDssr(emptySource({ stockVariances: [dip] })) as any;
    expect('tankMovement' in d.fuelStockVariance[0]).toBe(false);
  });
});
