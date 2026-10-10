import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { composeInsightsSales, eachDate, percentChange } from './compose.js';
import { GetInsightsSales } from './get-insights-sales.js';
import type { InsightsSalesQuery, InsightsSalesReader, InsightsSalesSource } from './ports.js';

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
    previous: { sales: 5000, closedDays: 4, otherSales: 400 },
    fuelLitres: [
      { productCode: 'HSD', litres: 300 },
      { productCode: 'MS', litres: 600 },
      { productCode: 'XP95', litres: 100 },
    ],
    other: { total: 500, top: { name: '20W-40 1L', quantity: 31 } },
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
  it('totals the closed days and compares with the previous period', () => {
    const r = composeInsightsSales(source());
    expect(r.total).toBe(6000);
    expect(r.previousTotal).toBe(5000);
    expect(r.changePct).toBe(20);
    expect(r.closedDays).toBe(3);
    expect(r.previousClosedDays).toBe(4);
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
        fuelLitres: [
          { productCode: 'MS', litres: 1 },
          { productCode: 'HSD', litres: 2 },
        ],
      }),
    );
    expect(productMix.map((p) => p.share)).toEqual([66.7, 33.3]);
  });

  it('reports lubes & others with change and top seller', () => {
    expect(composeInsightsSales(source()).otherProducts).toEqual({
      total: 500,
      previousTotal: 400,
      changePct: 25,
      top: { name: '20W-40 1L', quantity: 31 },
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
        fuelLitres: [],
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
  function readerFor(seen: InsightsSalesQuery[]): InsightsSalesReader {
    return {
      async read(q) {
        seen.push(q);
        return source();
      },
    };
  }

  it('reads under the caller organization and the requested range length', async () => {
    const seen: InsightsSalesQuery[] = [];
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

  it('refuses a station other than the one the context is scoped to', async () => {
    const res = await new GetInsightsSales({ reader: readerFor([]) }).execute(
      { stationId: 'station-2', days: 7 },
      ctx(),
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('FORBIDDEN');
  });
});
