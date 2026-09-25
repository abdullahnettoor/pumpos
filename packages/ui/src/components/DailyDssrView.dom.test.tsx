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
});
