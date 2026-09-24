import { describe, expect, it } from 'vitest';
import { buildProfitLoss, sumOfficeByEntryDate } from './profitLoss.js';

describe('sumOfficeByEntryDate', () => {
  it('sums per entry date, skipping voided, out-of-range and other-station rows', () => {
    const m = sumOfficeByEntryDate(
      [
        { entryDate: '2026-09-01', amount: 100 },
        { entryDate: '2026-09-01', amount: '50.5' },
        { entryDate: '2026-09-01', amount: 999, status: 'VOIDED' },
        { entryDate: '2026-08-31', amount: 70 },
        { entryDate: '2026-09-02', amount: 30, stationId: 'other' },
        { entryDate: null, amount: 10 },
      ],
      { from: '2026-09-01', to: '2026-09-30', stationId: 'st1' },
    );
    expect(Object.fromEntries(m)).toEqual({ '2026-09-01': 150.5 });
  });
});

describe('buildProfitLoss', () => {
  it('joins sales-day margin with office money by entry date', () => {
    const { days, totals } = buildProfitLoss({
      from: '2026-09-01',
      to: '2026-09-03',
      salesDays: [
        { date: '2026-09-01', grossMargin: 1000 },
        { date: '2026-09-02', grossMargin: 800, live: true },
      ],
      expenses: [
        { entryDate: '2026-09-01', amount: 200 },
        { entryDate: '2026-09-03', amount: 50 },
      ],
      income: [{ entryDate: '2026-09-02', amount: 25 }],
    });
    expect(days.map((d) => d.date)).toEqual(['2026-09-03', '2026-09-02', '2026-09-01']);
    expect(days[0]).toMatchObject({ hasSales: false, grossMargin: 0, netProfit: -50 });
    expect(days[1]).toMatchObject({ live: true, otherIncome: 25, netProfit: 825 });
    expect(days[2]).toMatchObject({ expenses: 200, netProfit: 800 });
    expect(totals).toEqual({ grossMargin: 1800, expenses: 250, otherIncome: 25, netProfit: 1575 });
  });

  it('returns no days for an empty period', () => {
    expect(buildProfitLoss({ from: '2026-09-01', to: '2026-09-01', salesDays: [] })).toEqual({
      days: [],
      totals: { grossMargin: 0, expenses: 0, otherIncome: 0, netProfit: 0 },
    });
  });
});
