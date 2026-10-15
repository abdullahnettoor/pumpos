import { describe, expect, it } from 'vitest';
import { DEFAULT_TANK_LEVEL_SETTINGS } from '@pump/shared';
import {
  TANK_FILTERS,
  fuelStock,
  itemState,
  lowTanks,
  movementTypeLabel,
  movementsIn,
  oneProduct,
  referenceLabel,
  tankViews,
  type MovementRow,
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
