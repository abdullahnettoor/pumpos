import { describe, expect, it } from 'vitest';
import { composeProfitLoss } from './compose.js';

describe('composeProfitLoss (ADR 0005)', () => {
  const report = composeProfitLoss({
    from: '2026-09-01',
    to: '2026-09-03',
    salesDays: [
      {
        date: '2026-09-01',
        live: false,
        pnl: {
          revenue: 5000,
          cogs: 4000,
          grossMargin: 1000,
          byProduct: [{ productId: 'ms', name: 'Petrol', revenue: 5000, cogs: 4000, margin: 1000 }],
        },
      },
      {
        date: '2026-09-02',
        live: true,
        pnl: {
          revenue: 3000,
          cogs: 2200,
          grossMargin: 800,
          byProduct: [{ productId: 'ms', name: 'Petrol', revenue: 3000, cogs: 2200, margin: 800 }],
        },
      },
      { date: '2026-08-31', live: false, pnl: { grossMargin: 9999 } },
    ],
    officeDays: [
      { date: '2026-09-01', expenses: 200, otherIncome: 0 },
      { date: '2026-09-02', expenses: 0, otherIncome: 25 },
      { date: '2026-09-03', expenses: 50, otherIncome: 0 },
    ],
  });

  it('joins sales-day margin with office money by entry date, newest first', () => {
    expect(report.days.map((d) => d.date)).toEqual(['2026-09-03', '2026-09-02', '2026-09-01']);
    expect(report.days[0]).toMatchObject({ hasSales: false, grossMargin: 0, netProfit: -50 });
    expect(report.days[1]).toMatchObject({ live: true, otherIncome: 25, netProfit: 825 });
    expect(report.days[2]).toMatchObject({ expenses: 200, netProfit: 800 });
  });

  it('totals the period and ignores days outside it', () => {
    expect(report.totals).toMatchObject({
      revenue: 8000,
      cogs: 6200,
      grossMargin: 1800,
      expenses: 250,
      otherIncome: 25,
      netProfit: 1575,
      marginPct: 22.5,
    });
  });

  it('aggregates per-product margin across days', () => {
    expect(report.byProduct).toEqual([
      expect.objectContaining({ productId: 'ms', revenue: 8000, margin: 1800, marginPct: 22.5 }),
    ]);
  });
});
