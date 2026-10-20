import { describe, expect, it } from 'vite-plus/test';
import { DEFAULT_TANK_LEVEL_SETTINGS } from '@pump/shared';
import {
  fuelSwatch,
  deriveFuelTanks,
  derivePendingDecant,
  shouldPlanPurchase,
} from './fuelsModel.js';

describe('deriveFuelTanks', () => {
  it('filters by product, computes fill, cover', () => {
    const t = deriveFuelTanks(
      [
        {
          id: 'a',
          name: 'T1',
          productId: 'p1',
          capacity: 20000,
          currentVolume: 4000,
          daysOfCover: 2.6,
        },
        {
          id: 'b',
          name: 'T2',
          productId: 'p2',
          capacity: 10000,
          currentVolume: 1,
          daysOfCover: null,
        },
      ],
      'p1',
      DEFAULT_TANK_LEVEL_SETTINGS,
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      id: 'a',
      name: 'T1',
      pct: 20,
      tone: 'critical',
      stock: 4000,
      capacity: 20000,
      daysOfCover: 2.6,
    });
  });

  it('colours tanks by the station tank levels (#520)', () => {
    const row = { id: 'a', name: 'T1', productId: 'p1', capacity: 20000, currentVolume: 4000 };
    const relaxed = { criticalBelowPct: 10, lowBelowPct: 25 };
    expect(deriveFuelTanks([row], 'p1', relaxed)[0]?.tone).toBe('low');
  });
});

describe('derivePendingDecant / shouldPlanPurchase', () => {
  const d = (over: object) =>
    ({
      status: 'PENDING_MEASUREMENT',
      createdAt: '2026-10-12T06:00:00Z',
      unloadStartedAt: null,
      lines: [{ productId: 'p1' }],
      links: [{ productId: 'p1', invoiceQty: 12000 }],
      ...over,
    }) as never;
  it('sums linked invoice qty, uses earliest time; null when none', () => {
    expect(derivePendingDecant([d({})], 'p1')).toEqual({
      qtyL: 12000,
      since: '2026-10-12T06:00:00Z',
    });
    expect(derivePendingDecant([d({ links: [] })], 'p1')?.qtyL).toBeNull();
    expect(derivePendingDecant([d({ status: 'MEASURED' })], 'p1')).toBeNull();
  });
  it('plan only for a critical tank without pending decantation', () => {
    const t = (tone: string, w = false) => ({ tone, waitingOnDecantation: w }) as never;
    expect(shouldPlanPurchase([t('critical')])).toBe(true);
    expect(shouldPlanPurchase([t('critical'), t('ok', true)])).toBe(false);
    expect(shouldPlanPurchase([t('low')])).toBe(false);
  });
});

describe('fuelSwatch', () => {
  it('colours a fuel by what it is, not its list position', () => {
    expect(fuelSwatch('DEMO-MS-a753c7', 'Petrol', 1)).toBe('bg-brand');
    expect(fuelSwatch('HSD', 'Diesel', 0)).toBe('bg-info-fg');
    expect(fuelSwatch('XP95', 'Premium', 0)).toBe('bg-warning-fg');
    expect(fuelSwatch('CNG', 'CNG', 1)).not.toBe(fuelSwatch('XP95', 'Premium', 0));
  });
});
