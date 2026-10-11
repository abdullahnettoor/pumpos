import { describe, expect, it } from 'vitest';
import { INSIGHTS_RANGE_DAYS } from '@pump/shared';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { composeInsightsSales, eachDate, percentChange, periodChange } from './compose.js';
import { GetInsightsSales } from './get-insights-sales.js';
import type { InsightsRangeQuery, InsightsSalesReader, InsightsSalesSource } from './ports.js';

const ORG = 'org-1';
const STATION = 'station-1';

function ctx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    organizationId: ORG,
    stationId: STATION,
    actorId: 'user-owner',
    role: 'Owner',
    clock: new FixedClock(new Date('2026-03-10T06:00:00.000Z')),
    ids: new SequentialIdGenerator('id'),
    ...overrides,
  } as ExecutionContext;
}

function source(over: Partial<InsightsSalesSource> = {}): InsightsSalesSource {
  return {
    range: { from: '2026-03-04', to: '2026-03-10' },
    previousRange: { from: '2026-02-25', to: '2026-03-03' },
    days: [
      { date: '2026-03-04', sales: 1000, volume: 100 },
      { date: '2026-03-05', sales: 3000, volume: 300 },
      { date: '2026-03-07', sales: 2000, volume: 200 },
    ],
    previous: { sales: 6000, closedDays: 4, otherSales: 400 },
    fuelVolumes: [
      { productCode: 'HSD', unit: 'L', quantity: 300 },
      { productCode: 'MS', unit: 'L', quantity: 600 },
      { productCode: 'XP95', unit: 'L', quantity: 100 },
    ],
    other: { total: 500, top: { name: '20W-40 1L', quantity: 31, revenue: 9300 } },
    templates: [
      {
        templateId: 't-1',
        name: 'Morning',
        shifts: 3,
        totalSales: 3000,
        totalVolume: 300,
        totalCashVariance: -630,
      },
    ],
    ...over,
  };
}

describe('percentChange', () => {
  it('is relative to the previous period, to one decimal', () => {
    expect(percentChange(6400, 6000)).toBe(6.7);
    expect(percentChange(5000, 6000)).toBe(-16.7);
  });
  it('is null when there is nothing to compare against', () => {
    expect(percentChange(100, 0)).toBeNull();
  });
});

describe('periodChange', () => {
  it('compares the per-closed-day averages, not the raw totals', () => {
    // 3 days at 2,000 vs 6 days at 1,000: totals say +0%, the average says +100%.
    expect(periodChange({ total: 6000, closedDays: 3 }, { total: 6000, closedDays: 6 })).toBe(100);
  });
  it('is null when either period has too few closed days to compare', () => {
    expect(periodChange({ total: 4000, closedDays: 2 }, { total: 7000, closedDays: 7 })).toBeNull();
    expect(periodChange({ total: 7000, closedDays: 7 }, { total: 4000, closedDays: 2 })).toBeNull();
    expect(periodChange({ total: 7000, closedDays: 7 }, { total: 0, closedDays: 0 })).toBeNull();
  });
  it('compares from the smallest coverage the rule accepts', () => {
    expect(periodChange({ total: 3300, closedDays: 3 }, { total: 3000, closedDays: 3 })).toBe(10);
  });
});

describe('eachDate', () => {
  it('lists every calendar date inclusive, across a month and a leap day', () => {
    expect(eachDate('2028-02-27', '2028-03-01')).toEqual([
      '2028-02-27',
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });
});

describe('composeInsightsSales', () => {
  it('totals the closed days and compares the per-day average with the previous period', () => {
    const r = composeInsightsSales(source());
    expect(r.total).toBe(6000);
    expect(r.previousTotal).toBe(6000);
    expect(r.closedDays).toBe(3);
    expect(r.previousClosedDays).toBe(4);
    // 2,000 a day now vs 1,500 a day before: +33.3%, even though the totals match.
    expect(r.average).toBe(2000);
    expect(r.previousAverage).toBe(1500);
    expect(r.changePct).toBe(33.3);
  });

  it('shows no change for 2 closed days against 7: the coverage is not comparable', () => {
    const r = composeInsightsSales(
      source({
        days: [
          { date: '2026-03-04', sales: 1000, volume: 100 },
          { date: '2026-03-05', sales: 3000, volume: 300 },
        ],
        previous: { sales: 7000, closedDays: 7, otherSales: 700 },
      }),
    );
    expect(r.changePct).toBeNull();
    expect(r.otherProducts.changePct).toBeNull();
    // The figures themselves are still reported, only the badge is withheld.
    expect(r.total).toBe(4000);
    expect(r.previousTotal).toBe(7000);
  });

  it('does not count a day that is still open inside the range', () => {
    // 4 of the 7 dates have no closed day (still open, or not traded): the average divides by the 3 closed ones.
    const r = composeInsightsSales(source());
    expect(r.trend.filter((d) => !d.closed)).toHaveLength(4);
    expect(r.closedDays).toBe(3);
    expect(r.average).toBe(2000);
  });

  it('averages per closed day, not per calendar day', () => {
    expect(composeInsightsSales(source()).average).toBe(2000);
  });

  it('finds the best day', () => {
    expect(composeInsightsSales(source()).best).toEqual({ date: '2026-03-05', sales: 3000 });
  });

  it('lays out one trend bar per calendar day, flagging days that were not closed', () => {
    const { trend } = composeInsightsSales(source());
    expect(trend.map((d) => d.date)).toEqual([
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
    expect(trend[1]).toEqual({ date: '2026-03-05', sales: 3000, volume: 300, closed: true });
    expect(trend[2]).toEqual({ date: '2026-03-06', sales: 0, volume: 0, closed: false });
  });

  it('shares litres per fuel grade, largest first', () => {
    const { productMix } = composeInsightsSales(source());
    expect(productMix).toEqual([
      { productCode: 'MS', litres: 600, share: 60 },
      { productCode: 'HSD', litres: 300, share: 30 },
      { productCode: 'XP95', litres: 100, share: 10 },
    ]);
  });

  it('rounds shares to one decimal', () => {
    const { productMix } = composeInsightsSales(
      source({
        fuelVolumes: [
          { productCode: 'MS', unit: 'L', quantity: 1 },
          { productCode: 'HSD', unit: 'L', quantity: 2 },
        ],
      }),
    );
    expect(productMix.map((p) => p.share)).toEqual([66.7, 33.3]);
  });

  it('keeps non-litre fuel out of the litre shares but reports it beside them', () => {
    const r = composeInsightsSales(
      source({
        fuelVolumes: [
          { productCode: 'MS', unit: 'Litre', quantity: 300 },
          { productCode: 'HSD', unit: 'L', quantity: 100 },
          { productCode: 'CNG', unit: 'kg', quantity: 250.5 },
        ],
      }),
    );
    expect(r.productMix).toEqual([
      { productCode: 'MS', litres: 300, share: 75 },
      { productCode: 'HSD', litres: 100, share: 25 },
    ]);
    expect(r.otherUnitFuels).toEqual([{ productCode: 'CNG', quantity: 250.5, unit: 'kg' }]);
  });

  it('has an empty mix, but still lists the other-unit fuel, when nothing was sold in litres', () => {
    const r = composeInsightsSales(
      source({ fuelVolumes: [{ productCode: 'CNG', unit: 'kg', quantity: 80 }] }),
    );
    expect(r.productMix).toEqual([]);
    expect(r.otherUnitFuels).toHaveLength(1);
  });

  it('reports lubes & others with change and top seller', () => {
    // 500 over 3 closed days vs 400 over 4: 166.7 a day vs 100 a day.
    expect(composeInsightsSales(source()).otherProducts).toEqual({
      total: 500,
      previousTotal: 400,
      changePct: 66.7,
      top: { name: '20W-40 1L', quantity: 31, revenue: 9300 },
    });
  });

  it('averages each Shift Template per Shift', () => {
    expect(composeInsightsSales(source()).shiftTemplates).toEqual([
      {
        templateId: 't-1',
        name: 'Morning',
        shifts: 3,
        avgSales: 1000,
        avgVolume: 100,
        avgCashVariance: -210,
      },
    ]);
  });

  it('hides the change when the previous period has no closed days', () => {
    const r = composeInsightsSales(
      source({ previous: { sales: 0, closedDays: 0, otherSales: 0 } }),
    );
    expect(r.previousTotal).toBe(0);
    expect(r.changePct).toBeNull();
    expect(r.otherProducts.changePct).toBeNull();
  });

  it('is an empty report when the Station has no closed Business Day', () => {
    const r = composeInsightsSales(
      source({
        range: null,
        previousRange: null,
        days: [],
        previous: { sales: 0, closedDays: 0, otherSales: 0 },
        fuelVolumes: [],
        other: { total: 0, top: null },
        templates: [],
      }),
    );
    expect(r).toMatchObject({
      range: null,
      previousRange: null,
      closedDays: 0,
      total: 0,
      changePct: null,
      average: 0,
      best: null,
      trend: [],
      productMix: [],
      shiftTemplates: [],
    });
  });
});

describe('GetInsightsSales', () => {
  function readerFor(seen: InsightsRangeQuery[]): InsightsSalesReader {
    return {
      async read(q) {
        seen.push(q);
        return source();
      },
    };
  }

  it('reads under the caller organization and the requested range length', async () => {
    const seen: InsightsRangeQuery[] = [];
    const res = await new GetInsightsSales({ reader: readerFor(seen) }).execute(
      { stationId: STATION, days: 30 },
      ctx(),
    );
    expect(res.success).toBe(true);
    expect(seen).toEqual([{ organizationId: ORG, stationId: STATION, days: 30 }]);
  });

  it('rejects a range length the tab does not offer', async () => {
    const res = await new GetInsightsSales({ reader: readerFor([]) }).execute(
      { stationId: STATION, days: 14 as never },
      ctx(),
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts every range length the tab offers', async () => {
    for (const days of INSIGHTS_RANGE_DAYS) {
      const res = await new GetInsightsSales({ reader: readerFor([]) }).execute(
        { stationId: STATION, days },
        ctx(),
      );
      expect(res.success).toBe(true);
    }
  });
});
