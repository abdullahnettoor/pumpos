import { describe, expect, it } from 'vitest';
import { STOCK_VARIANCE_TOLERANCE_PCT } from '@pump/shared';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { composeAttendantVariance, composeCreditHealth, composeStockLoss } from './compose.js';
import { GetInsightsAttendantVariance } from './get-insights-attendant-variance.js';
import { GetInsightsCreditHealth } from './get-insights-credit-health.js';
import { GetInsightsStockLoss } from './get-insights-stock-loss.js';
import type {
  InsightsAttendantVarianceRow,
  InsightsCreditHealthSource,
  InsightsRangeQuery,
  InsightsStockLossRow,
} from './ports.js';

/**
 * Insights part 2 (#402): the three blocks beside the sales block. One test
 * group per figure; the use cases only validate the query and hand the reader's
 * source to composition.
 */

const ctx = {
  organizationId: 'org-1',
  stationId: 'st-1',
  actorId: 'u-1',
  role: 'Owner',
  clock: new FixedClock(new Date('2026-03-10T06:00:00.000Z')),
  ids: new SequentialIdGenerator('id'),
} as ExecutionContext;

const attendant = (over: Partial<InsightsAttendantVarianceRow>): InsightsAttendantVarianceRow => ({
  attendantId: 'a-1',
  name: 'Ravi',
  shifts: 4,
  shortShifts: 1,
  overShifts: 0,
  netVariance: -50,
  ...over,
});

describe('composeAttendantVariance', () => {
  it('orders the bars from the most short to the most over', () => {
    const r = composeAttendantVariance([
      attendant({ attendantId: 'a-2', name: 'Meena', netVariance: 120 }),
      attendant({ attendantId: 'a-1', name: 'Ravi', netVariance: -350 }),
      attendant({ attendantId: 'a-3', name: 'Suresh', netVariance: 0 }),
    ]);
    expect(r.map((a) => a.name)).toEqual(['Ravi', 'Suresh', 'Meena']);
  });

  it('keeps the signed net, the counts and the shift total as read', () => {
    const [r] = composeAttendantVariance([
      attendant({ shifts: 6, shortShifts: 2, overShifts: 1, netVariance: -75.004 }),
    ]);
    expect(r).toEqual({
      attendantId: 'a-1',
      name: 'Ravi',
      shifts: 6,
      shortShifts: 2,
      overShifts: 1,
      netVariance: -75,
    });
  });

  it('breaks a tie by name so the order is stable', () => {
    const r = composeAttendantVariance([
      attendant({ attendantId: 'a-2', name: 'Zoya', netVariance: -10 }),
      attendant({ attendantId: 'a-1', name: 'Asha', netVariance: -10 }),
    ]);
    expect(r.map((a) => a.name)).toEqual(['Asha', 'Zoya']);
  });

  it('is empty when no closed Shift has a two-level summary', () => {
    expect(composeAttendantVariance([])).toEqual([]);
  });
});

const tank = (over: Partial<InsightsStockLossRow>): InsightsStockLossRow => ({
  tankId: 't-1',
  tankName: 'Tank 1',
  productCode: 'MS',
  varianceLitres: -40,
  soldLitres: 20000,
  dips: 1,
  valueAtCost: -3600,
  ...over,
});

describe('composeStockLoss', () => {
  it('reports the loss in litres, as a share of litres sold, and in rupees at cost', () => {
    const [r] = composeStockLoss([tank({})]);
    expect(r.varianceLitres).toBe(-40);
    expect(r.soldLitres).toBe(20000);
    expect(r.pctOfSold).toBe(-0.2);
    // The value arrives frozen from the DSSR snapshots; it is only rounded here.
    expect(r.valueAtCost).toBe(-3600);
  });

  it('flags a tank within tolerance and one outside it', () => {
    const limit = (20000 * STOCK_VARIANCE_TOLERANCE_PCT) / 100; // 100 L
    const rows = composeStockLoss([
      tank({ tankId: 'within', varianceLitres: -limit }),
      tank({ tankId: 'outside', varianceLitres: -(limit + 1) }),
    ]);
    expect(rows.find((r) => r.tankId === 'within')?.withinTolerance).toBe(true);
    expect(rows.find((r) => r.tankId === 'outside')?.withinTolerance).toBe(false);
  });

  it('judges a gain by its size too: it is a recording problem, not a good result', () => {
    const [r] = composeStockLoss([tank({ varianceLitres: 400, valueAtCost: 36000 })]);
    expect(r.valueAtCost).toBe(36000);
    expect(r.withinTolerance).toBe(false);
  });

  it('has no percentage when the tank sold nothing, and tolerates only a zero variance', () => {
    const [idle] = composeStockLoss([tank({ soldLitres: 0, varianceLitres: 0 })]);
    expect(idle.pctOfSold).toBeNull();
    expect(idle.withinTolerance).toBe(true);
    const [lost] = composeStockLoss([tank({ soldLitres: 0, varianceLitres: -5 })]);
    expect(lost.pctOfSold).toBeNull();
    expect(lost.withinTolerance).toBe(false);
  });

  it('keeps an unvalued variance unvalued instead of calling it zero rupees', () => {
    const [r] = composeStockLoss([tank({ valueAtCost: null })]);
    expect(r.valueAtCost).toBeNull();
  });

  it('keeps a tank with no dip: zero litres, no dips, within tolerance', () => {
    const [r] = composeStockLoss([
      tank({ varianceLitres: 0, dips: 0, valueAtCost: 0, soldLitres: 1200 }),
    ]);
    expect(r).toMatchObject({ varianceLitres: 0, dips: 0, withinTolerance: true, pctOfSold: 0 });
  });

  it('lists the biggest loss first', () => {
    const r = composeStockLoss([
      tank({ tankId: 'a', tankName: 'A', varianceLitres: -10 }),
      tank({ tankId: 'b', tankName: 'B', varianceLitres: -90 }),
      tank({ tankId: 'c', tankName: 'C', varianceLitres: 20 }),
    ]);
    expect(r.map((x) => x.tankId)).toEqual(['b', 'a', 'c']);
  });
});

const credit = (over: Partial<InsightsCreditHealthSource> = {}): InsightsCreditHealthSource => ({
  range: { from: '2026-03-04', to: '2026-03-10' },
  closedDays: 5,
  creditGiven: 50000,
  sales: 400000,
  collected: 30000,
  previous: { creditGiven: 40000, closedDays: 5 },
  ...over,
});

describe('composeCreditHealth', () => {
  it('moves the receivables by credit given minus collected', () => {
    const r = composeCreditHealth(credit());
    expect(r.creditGiven).toBe(50000);
    expect(r.collected).toBe(30000);
    expect(r.receivablesChange).toBe(20000);
  });

  it('shrinks the receivables when collections outrun credit', () => {
    expect(composeCreditHealth(credit({ collected: 65000 })).receivablesChange).toBe(-15000);
  });

  it('gives credit as a share of sales to one decimal', () => {
    expect(composeCreditHealth(credit()).creditShareOfSales).toBe(12.5);
    expect(
      composeCreditHealth(credit({ creditGiven: 33333, sales: 400000 })).creditShareOfSales,
    ).toBe(8.3);
  });

  it('has no share when there were no sales', () => {
    expect(composeCreditHealth(credit({ sales: 0, creditGiven: 0 })).creditShareOfSales).toBeNull();
  });

  it('compares credit given per closed day, and only with comparable coverage', () => {
    // 50,000 over 5 days vs 40,000 over 5 days: +25%.
    expect(composeCreditHealth(credit()).creditGivenChangePct).toBe(25);
    // 2 closed days now: not comparable.
    expect(composeCreditHealth(credit({ closedDays: 2 })).creditGivenChangePct).toBeNull();
    expect(
      composeCreditHealth(credit({ previous: { creditGiven: 40000, closedDays: 2 } }))
        .creditGivenChangePct,
    ).toBeNull();
  });

  it('answers zeros for a station with no closed day', () => {
    const r = composeCreditHealth({
      range: null,
      closedDays: 0,
      creditGiven: 0,
      sales: 0,
      collected: 0,
      previous: { creditGiven: 0, closedDays: 0 },
    });
    expect(r).toMatchObject({
      range: null,
      creditGiven: 0,
      collected: 0,
      receivablesChange: 0,
      creditShareOfSales: null,
      creditGivenChangePct: null,
    });
  });
});

describe('the Insights part 2 use cases', () => {
  it('read under the caller organization and the requested station and range', async () => {
    const seen: InsightsRangeQuery[] = [];
    const record = async (q: InsightsRangeQuery) => {
      seen.push(q);
      return [];
    };
    await new GetInsightsAttendantVariance({ reader: { read: record } }).execute(
      { stationId: 'st-9', days: 30 },
      ctx,
    );
    await new GetInsightsStockLoss({ reader: { read: record } }).execute(
      { stationId: 'st-9', days: 30 },
      ctx,
    );
    await new GetInsightsCreditHealth({
      reader: {
        read: async (q) => {
          seen.push(q);
          return credit();
        },
      },
    }).execute({ stationId: 'st-9', days: 30 }, ctx);
    expect(seen).toEqual(Array(3).fill({ organizationId: 'org-1', stationId: 'st-9', days: 30 }));
  });

  it('refuse a range length the tab does not offer, before reading', async () => {
    let reads = 0;
    const reader = {
      read: async () => {
        reads += 1;
        return [];
      },
    };
    for (const days of [14, 0, Number.NaN]) {
      const a = await new GetInsightsAttendantVariance({ reader }).execute(
        { stationId: 'st-1', days },
        ctx,
      );
      const s = await new GetInsightsStockLoss({ reader }).execute(
        { stationId: 'st-1', days },
        ctx,
      );
      expect(a.success).toBe(false);
      expect(s.success).toBe(false);
    }
    expect(reads).toBe(0);
  });
});
