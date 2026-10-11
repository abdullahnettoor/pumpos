// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders.js';
import { DailyDssrView } from './DailyDssrView.js';

afterEach(cleanup);

describe('DailyDssrView (ADR 0005: sales-only)', () => {
  it('renders gross margin and ignores office keys left in old snapshots', () => {
    renderWithProviders(
      <DailyDssrView
        dailyDssr={{
          businessDate: '2026-03-01',
          generatedAt: '2026-03-02T01:00:00.000Z',
          snapshotData: {
            pnl: { revenue: 10000, cogs: 9000, grossMargin: 1000, netProfit: 777, expenses: 223 },
            collections: { total: 4321, Cash: 4321 },
            expenses: { total: 223, drawer: 223 },
            supplierPayments: { drawer: 5, bank: 6 },
            income: { total: 99, tax: { total: 9 } },
          },
        }}
      />,
    );
    expect(screen.queryByText(/Net Profit/i)).toBeNull();
    expect(screen.queryByText(/Total Collections|Cash Collections/)).toBeNull();
    expect(screen.queryByText(/4,321/)).toBeNull();
    expect(screen.queryByText(/Supplier Payments/)).toBeNull();
    expect(screen.queryByText(/Operating Expenses/)).toBeNull();
    expect(screen.getAllByText(/Gross Margin/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Daily Cash Book/)).toBeTruthy();
  });

  describe('OMC Card Sales (ADR 0001)', () => {
    const view = (snapshotData: Record<string, unknown>) =>
      renderWithProviders(
        <DailyDssrView
          dailyDssr={{
            businessDate: '2026-10-10',
            generatedAt: '2026-10-11T01:00:00.000Z',
            snapshotData: { credit: { normalCredit: 0, fleetCredit: 34040 }, ...snapshotData },
          }}
        />,
      );

    it("shows the day's OMC card sales in the sales summary, next to Credit Sales", () => {
      view({ omcCard: { total: 2000, count: 1 } });
      expect(screen.getByText('Fleet Credit Sales')).toBeTruthy();
      const row = screen.getByText('OMC Card Sales').parentElement as HTMLElement;
      expect(row.textContent).toContain('2,000');
    });

    it('leaves a snapshot frozen before the field, or a day without any, unchanged', () => {
      view({});
      expect(screen.queryByText('OMC Card Sales')).toBeNull();
      cleanup();
      view({ omcCard: { total: 0, count: 0 } });
      expect(screen.queryByText('OMC Card Sales')).toBeNull();
    });
  });
});
