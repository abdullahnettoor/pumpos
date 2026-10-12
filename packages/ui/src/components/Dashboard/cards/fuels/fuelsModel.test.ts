import { describe, expect, it } from 'vitest';
import type { DensityTodayProductSummary } from '@pump/shared';
import { deriveDensityState, deriveFuelTanks, tankTone } from './fuelsModel.js';

const D = '2026-10-12';
const prod = (over: Partial<DensityTodayProductSummary>): DensityTodayProductSummary => ({
  productId: 'p1',
  productName: 'Petrol',
  productCode: 'MS',
  latestToday: null,
  todayRecorded: false,
  trend14d: [],
  trendValues: [],
  lastReadings: [],
  ...over,
});
const reading = (density15: number, kind = 'MORNING', businessDate = D) =>
  ({ density15, kind, businessDate, observedTempC: 30, recordedAt: '2026-10-12T01:00:00Z' }) as any;

describe('tankTone', () => {
  it('red below 25, amber below 40', () => {
    expect([24.9, 25, 39.9, 40].map(tankTone)).toEqual(['red', 'amber', 'amber', 'ok']);
    expect(tankTone(null)).toBe('unknown');
  });
});

describe('deriveDensityState', () => {
  const trend = [
    { date: '2026-10-11', density15: 740 },
    { date: D, density15: 741 },
  ];
  it('recorded with change vs yesterday', () => {
    const s = deriveDensityState(prod({ latestToday: reading(741), trend14d: trend }), D, 3);
    expect(s).toMatchObject({ kind: 'recorded', change: { delta: 1, from: '2026-10-11' } });
  });
  it('flags a jump beyond tolerance', () => {
    const s = deriveDensityState(prod({ latestToday: reading(746), trend14d: trend }), D, 3);
    expect(s.kind).toBe('jump');
  });
  it('a decantation today explains the change', () => {
    const s = deriveDensityState(
      prod({
        latestToday: reading(746),
        trend14d: trend,
        lastReadings: [reading(746, 'DECANTATION')],
      }),
      D,
      3,
    );
    expect(s.kind).toBe('recorded');
  });
  it('not recorded keeps the last value', () => {
    const s = deriveDensityState(
      prod({ trend14d: [{ date: '2026-10-10', density15: 739 }] }),
      D,
      3,
    );
    expect(s).toEqual({ kind: 'not-recorded', last: 739 });
  });
  it('first day has no history', () => {
    const s = deriveDensityState(
      prod({ latestToday: reading(741), trend14d: [{ date: D, density15: 741 }] }),
      D,
      3,
    );
    expect(s.kind).toBe('no-history');
  });
});

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
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ pct: 20, tone: 'red', capacityKl: 20, cover: '2.6 days' });
  });
});
