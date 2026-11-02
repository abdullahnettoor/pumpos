import { describe, expect, it } from 'vite-plus/test';
import { composeProfitLoss } from './compose.js';
import { round2 } from '@pump/shared';

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

describe('P&L head type split', () => {
  it('places direct items before gross profit and indirect items before net profit', () => {
    const report = composeProfitLoss({
      from: '2026-09-01',
      to: '2026-09-01',
      salesDays: [{ date: '2026-09-01', live: false, pnl: { grossMargin: 1000 } }],
      officeDays: [
        {
          date: '2026-09-01',
          expenses: 300,
          otherIncome: 75,
          directExpenses: 100,
          indirectExpenses: 200,
          directIncome: 50,
          indirectIncome: 25,
        },
      ],
    });
    expect(report.days[0]).toMatchObject({
      directExpenses: 100,
      indirectExpenses: 200,
      directIncome: 50,
      indirectIncome: 25,
      grossProfit: 950,
      netProfit: 775,
    });
    expect(report.totals).toMatchObject({ grossProfit: 950, netProfit: 775 });
  });

  it('sums rounded splits and preserves net profit across fractional-paise inputs', () => {
    const amounts = [0, 0.005, 0.015, 0.025, 0.099, 1.005, 23.456];
    for (const amount of amounts) {
      const report = composeProfitLoss({
        from: '2026-09-01',
        to: '2026-09-03',
        salesDays: [
          { date: '2026-09-01', live: false, pnl: { grossMargin: 100.005 } },
          { date: '2026-09-03', live: false, pnl: { grossMargin: 0 } },
          { date: '2026-08-31', live: false, pnl: { grossMargin: 9999 } },
        ],
        officeDays: [
          {
            date: '2026-09-01',
            expenses: 0,
            otherIncome: 0,
            directExpenses: amount,
            indirectExpenses: 1.005,
            directIncome: 0.015,
            indirectIncome: 0.025,
          },
          {
            date: '2026-09-02',
            expenses: 0,
            otherIncome: 0,
            directExpenses: 3,
            indirectExpenses: 4,
            directIncome: 5,
            indirectIncome: 6,
          },
          { date: '2026-09-03', expenses: 0, otherIncome: 0 },
          { date: '2026-09-04', expenses: 9999, otherIncome: 0 },
        ],
      });
      expect(report.days).toHaveLength(3);
      expect(report.days[0]).toMatchObject({ grossProfit: 0, netProfit: 0 });
      expect(report.days[1]).toMatchObject({ hasSales: false, grossProfit: 2, netProfit: 4 });
      for (const day of report.days) {
        expect(day.netProfit).toBe(round2(day.grossMargin - day.expenses + day.otherIncome));
      }
      expect(report.totals.netProfit).toBe(
        round2(report.totals.grossMargin - report.totals.expenses + report.totals.otherIncome),
      );
      for (const key of [
        'directExpenses',
        'indirectExpenses',
        'directIncome',
        'indirectIncome',
        'grossProfit',
      ] as const) {
        expect(report.totals[key]).toBe(
          round2(report.days.reduce((sum, day) => sum + day[key], 0)),
        );
      }
    }
  });

  it('preserves the former result for paise-precision office totals', () => {
    for (let n = 0; n < 100; n++) {
      const directExpenses = n / 100;
      const indirectExpenses = (137 - n) / 100;
      const directIncome = (n * 3) / 100;
      const indirectIncome = (200 - n) / 100;
      const expenses = round2(directExpenses + indirectExpenses);
      const otherIncome = round2(directIncome + indirectIncome);
      const report = composeProfitLoss({
        from: '2026-09-01',
        to: '2026-09-01',
        salesDays: [{ date: '2026-09-01', live: false, pnl: { grossMargin: 12.34 } }],
        officeDays: [
          {
            date: '2026-09-01',
            expenses,
            otherIncome,
            directExpenses,
            indirectExpenses,
            directIncome,
            indirectIncome,
          },
        ],
      });
      expect(report.totals.netProfit).toBe(round2(12.34 - expenses + otherIncome));
    }
  });
});
