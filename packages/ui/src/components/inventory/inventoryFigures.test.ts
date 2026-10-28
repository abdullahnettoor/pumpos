import { describe, expect, it } from 'vite-plus/test';
import { DEFAULT_TANK_LEVEL_SETTINGS } from '@pump/shared';
import {
  TANK_FILTERS,
  fuelStock,
  itemState,
  lowTanks,
  movementTypeLabel,
  movementsIn,
  oneProduct,
  productCounts,
  reconciliationCounts,
  reconciliationsIn,
  referenceLabel,
  tanksStock,
  tankViews,
  type MovementRow,
  type VarianceRow,
  type TankRow,
} from './inventoryFigures.js';

const tank = (over: Partial<TankRow>): TankRow => ({
  id: 't',
  name: 'Tank',
  productId: 'p',
  capacity: 20_000,
  currentVolume: 10_000,
  ...over,
});

describe('inventory figures (#536)', () => {
  it('heads fuel stock with litres; other units go to the hint', () => {
    expect(
      fuelStock([
        tank({ currentVolume: 1000 }),
        tank({ currentVolume: 500, productUnit: 'Litres' }),
        tank({ currentVolume: 80, productUnit: 'kg' }),
      ]),
    ).toEqual({ value: '1,500.00 L', hint: '80.00 kg · 3 tanks' });
    expect(fuelStock([])).toEqual({ value: '0.00 L', hint: '0 tanks' });
  });

  it('reads tank levels with the station thresholds, the same model as the Dashboard', () => {
    const views = tankViews(
      [
        tank({ id: 'a', currentVolume: 2_000 }), // 10%: critical
        tank({ id: 'b', currentVolume: 6_000 }), // 30%: low
        tank({ id: 'c', currentVolume: 23_000, waitingOnDecantation: true }),
      ],
      DEFAULT_TANK_LEVEL_SETTINGS,
    );
    expect(lowTanks(views)).toEqual({ count: 2, critical: 1 });
    expect(views.filter(TANK_FILTERS.low).map((t) => t.row.id)).toEqual(['a', 'b']);
    expect(views.filter(TANK_FILTERS.over).map((t) => t.row.id)).toEqual(['c']);
    expect(views.filter(TANK_FILTERS.decanting).map((t) => t.row.id)).toEqual(['c']);
  });

  it('names a product stock state only when there is a problem', () => {
    expect(itemState({ quantity: 3 })).toBeNull();
    expect(itemState({ quantity: '0' })).toBe('out-of-stock');
    expect(itemState({ quantity: -1 })).toBe('oversold');
  });

  it('filters movements by range, type, product and search', () => {
    const rows: MovementRow[] = [
      {
        id: '1',
        businessDate: '2026-10-02',
        productId: 'a',
        productName: 'Petrol',
        movementType: 'Sale',
        quantity: -1,
        tankName: 'T1',
      },
      {
        id: '2',
        businessDate: '2026-09-30',
        productId: 'a',
        productName: 'Petrol',
        movementType: 'Sale',
        quantity: -1,
      },
      {
        id: '3',
        businessDate: '2026-10-03',
        productId: 'b',
        productName: 'Diesel',
        movementType: 'Decantation',
        quantity: 5,
      },
    ];
    const range = { from: '2026-10-01', to: '2026-10-31' };
    const ids = (f: Partial<Parameters<typeof movementsIn>[1]>) =>
      movementsIn(rows, { range, type: '', productId: '', search: '', ...f }).map((m) => m.id);
    expect(ids({})).toEqual(['1', '3']);
    expect(ids({ type: 'Decantation' })).toEqual(['3']);
    expect(ids({ productId: 'a' })).toEqual(['1']);
    expect(ids({ search: 't1' })).toEqual(['1']);
    expect(oneProduct(rows.slice(0, 2))).toBe(true);
    expect(oneProduct(rows)).toBe(false);
    expect(oneProduct([])).toBe(false);
  });

  it('reads codes as words', () => {
    expect(referenceLabel('decantation_tank_line')).toBe('Decantation');
    expect(referenceLabel('SOME_NEW_CODE')).toBe('Some new code');
    expect(referenceLabel(null)).toBeNull();
    expect(movementTypeLabel('OpeningBalance')).toBe('Opening balance');
    expect(movementTypeLabel('Sale')).toBe('Sale');
  });
});

describe('inventory figures · totals and counts (#582 review)', () => {
  it('totals the tanks shown within one unit only', () => {
    const views = tankViews(
      [
        tank({ id: 'a', currentVolume: 2_000 }),
        tank({ id: 'b', currentVolume: 3_500, productUnit: 'Litres' }),
        tank({ id: 'c', currentVolume: 80, productUnit: 'kg' }),
      ],
      DEFAULT_TANK_LEVEL_SETTINGS,
    );
    expect(tanksStock(views.slice(0, 2))).toBe('5,500.00 L');
    expect(tanksStock(views)).toBeNull(); // L + kg don't add up
    expect(tanksStock([])).toBeNull();
  });

  it('counts each product chip under the other filters', () => {
    const rows: MovementRow[] = [
      { id: '1', businessDate: '2026-10-02', productId: 'a', movementType: 'Sale', quantity: -1 },
      {
        id: '2',
        businessDate: '2026-10-03',
        productId: 'a',
        movementType: 'Purchase',
        quantity: 1,
      },
      { id: '3', businessDate: '2026-10-03', productId: 'b', movementType: 'Sale', quantity: -1 },
      { id: '4', businessDate: '2026-09-03', productId: 'b', movementType: 'Sale', quantity: -1 },
    ];
    const range = { from: '2026-10-01', to: '2026-10-31' };
    expect(productCounts(rows, { range, type: '', search: '' })).toEqual({ '': 3, a: 2, b: 1 });
    expect(productCounts(rows, { range, type: 'Sale', search: '' })).toEqual({ '': 2, a: 1, b: 1 });
  });

  it('counts reconciliations by the one balanced rule, newest first in the range', () => {
    const v = (id: string, d: string, q: number): VarianceRow => ({
      id,
      businessDate: d,
      expectedQuantity: 0,
      actualQuantity: 0,
      varianceQuantity: q,
    });
    const rows = [v('1', '2026-10-02', -5), v('2', '2026-10-09', 3), v('3', '2026-10-05', 0)];
    const inRange = reconciliationsIn([...rows, v('4', '2025-01-01', -1)], {
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(inRange.map((r) => r.id)).toEqual(['2', '3', '1']);
    expect(reconciliationCounts(inRange)).toEqual({ all: 3, short: 1, surplus: 1, balanced: 1 });
  });
});
