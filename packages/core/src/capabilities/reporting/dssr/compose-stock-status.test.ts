import { describe, expect, it } from 'vite-plus/test';
import { composeDssr } from './compose.js';
import type { DssrSourceData } from './ports.js';

type StockRow = DssrSourceData['stockVariances'][number];

const row = (varianceQuantity: number, inventoryType = 'BULK'): StockRow => ({
  tankName: 'T1',
  productName: 'Petrol',
  unit: 'Litre',
  inventoryType,
  expectedQuantity: 5000,
  actualQuantity: 5000 + varianceQuantity,
  varianceQuantity,
  reason: null,
});

/** The part of a composed stock line this test reads. */
interface ComposedStockLine {
  status: 'OK' | 'Gain' | 'Loss';
}
interface ComposedStock {
  fuelStockVariance: ComposedStockLine[];
  merchandiseStockVariance: ComposedStockLine[];
}

const statuses = (rows: StockRow[]): ComposedStockLine['status'][] => {
  const d = composeDssr({
    shiftSummaries: [],
    purchases: [],
    sales: [],
    creditSales: [],
    omcCardSales: [],
    stockVariances: rows,
    saleItems: [],
    products: {},
    nozzles: {},
  }) as unknown as ComposedStock;
  return [...d.fuelStockVariance, ...d.merchandiseStockVariance].map((r) => r.status);
};

describe('composeDssr stock line status: the shared quantity rule (#556)', () => {
  it('reads a variance under half the recorded step as OK, either way', () => {
    expect(statuses([row(0), row(0.0004), row(-0.0004), row(0.1 + 0.2 - 0.3)])).toEqual([
      'OK',
      'OK',
      'OK',
      'OK',
    ]);
  });

  it('reads the smallest recorded step (1 ml) and beyond by its sign', () => {
    expect(statuses([row(-0.001), row(0.001), row(-10), row(2, 'ITEM')])).toEqual([
      'Loss',
      'Gain',
      'Loss',
      'Gain',
    ]);
  });
});

describe('composeDssr frozen tank variance limit', () => {
  it('freezes the limit and flags only tanks without changing their status', () => {
    const tank = {
      ...row(-5),
      productId: 'p1',
      tankMovement: {
        openingQuantity: 1000,
        receivedQuantity: 0,
        soldQuantity: 1000,
        adjustedQuantity: 0,
      },
    };
    const source: DssrSourceData = {
      shiftSummaries: [
        {
          shiftId: 's1',
          snapshot: { readings: [{ nozzleId: 'n1', productId: 'p1', netVolume: 1000 }] },
        },
      ],
      purchases: [],
      sales: [],
      creditSales: [],
      omcCardSales: [],
      stockVariances: [tank, row(2, 'ITEM')],
      saleItems: [],
      products: {},
      nozzles: {},
    };
    const defaultSnap = composeDssr(source);
    expect(defaultSnap.stockVarianceTolerancePct).toBe(0.5);
    const strict = composeDssr(source, { stockVarianceTolerancePct: 0.1 });
    const lenient = composeDssr(source, { stockVarianceTolerancePct: 1 });
    expect(strict.stockVarianceTolerancePct).toBe(0.1);
    expect(strict.fuelStockVariance).toMatchObject([{ withinTolerance: false, status: 'Loss' }]);
    expect(lenient.fuelStockVariance).toMatchObject([{ withinTolerance: true, status: 'Loss' }]);
    expect((lenient.merchandiseStockVariance as object[])[0]).not.toHaveProperty('withinTolerance');

    source.stockVariances = [{ ...row(-5), productId: 'p1' }];
    expect(composeDssr(source, { stockVarianceTolerancePct: 1 }).fuelStockVariance).toMatchObject([
      { withinTolerance: true },
    ]);
    source.stockVariances.push({ ...row(-5), productId: 'p1', tankName: 'T2' });
    expect(composeDssr(source, { stockVarianceTolerancePct: 1 }).fuelStockVariance).toMatchObject([
      { withinTolerance: false },
      { withinTolerance: false },
    ]);
  });
});
