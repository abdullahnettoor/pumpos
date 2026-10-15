// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { resolveBusinessDate } from '@pump/shared';
import type { ProfitLossReport } from '../../services/cloud.js';
import { renderWithProviders } from '../../test/renderWithProviders.js';

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
};
const today = resolveBusinessDate({ timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' });

const figures = (revenue: number, cogs: number, expenses: number, otherIncome: number) => ({
  revenueFuel: revenue * 0.9,
  revenueMerch: revenue * 0.1,
  revenue,
  cogsFuel: cogs * 0.9,
  cogsMerch: cogs * 0.1,
  cogs,
  grossMargin: revenue - cogs,
  expenses,
  otherIncome,
  netProfit: revenue - cogs - expenses + otherIncome,
});

const periodReport: ProfitLossReport = {
  from: '2020-01-01',
  to: today,
  days: [
    { date: today, live: true, hasSales: true, ...figures(10000, 9000, 500, 0) },
    { date: '2020-01-01', live: false, hasSales: true, ...figures(20000, 18000, 500, 100) },
  ],
  totals: { ...figures(30000, 27000, 1000, 100), marginPct: 10 },
  byProduct: [
    {
      productId: 'p-diesel',
      name: 'Diesel',
      code: 'HSD',
      kind: 'fuel',
      quantity: 300,
      revenue: 27000,
      cogs: 24300,
      margin: 2700,
      marginPct: 10,
    },
    {
      productId: 'p-oil',
      name: 'Engine oil',
      code: 'EO',
      kind: 'merchandise',
      quantity: 6,
      revenue: 3000,
      cogs: 3200,
      margin: -200,
      marginPct: -6.67,
    },
  ],
};

const ok = (data: unknown) => ({
  data,
  isPending: false,
  isLoading: false,
  isError: false,
  fetchStatus: 'idle' as const,
  refetch: vi.fn(),
});

let report: ProfitLossReport = periodReport;

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useProfitLoss: () => ok(report),
  useDailyDssrPreview: () =>
    ok({ generatedAt: '2026-10-14T09:30:00.000Z', snapshotData: { shiftsIncluded: 1 } }),
  useShiftStatus: () => ok({ activeShift: { id: 'sh-1' } }),
  useProducts: () =>
    ok([
      { id: 'p-diesel', unit: 'L' },
      { id: 'p-oil', unit: 'Nos' },
    ]),
}));

const { ProfitLossView } = await import('./ProfitLossView.js');

/** The table under a section header (layout A: SectionHeader, then its Data Section). */
const sectionTable = (testId: string) =>
  screen.getByTestId(testId).parentElement!.querySelector('table') as HTMLElement;

describe('ProfitLossView', () => {
  afterEach(() => {
    cleanup();
    report = periodReport;
  });

  it('shows at most four in-range tiles, net profit plain unless it is a loss', () => {
    renderWithProviders(<ProfitLossView selectedStation={station} />);
    const scopes = screen.getAllByText('In range');
    expect(scopes.length).toBeLessThanOrEqual(4);
    expect(screen.queryByText('COGS', { selector: '.truncate' })).toBeNull();
    expect(screen.getByText('10.0% of revenue')).toBeTruthy();
    expect(screen.getByText('Other income ₹100.00')).toBeTruthy();
    const net = screen.getByText('Net profit', { selector: 'span' }).closest('[data-alert]');
    expect(net).toBeNull();
  });

  it('flags a loss on the net profit tile', () => {
    report = {
      ...periodReport,
      totals: { ...figures(1000, 900, 500, 0), marginPct: 10 },
    };
    const { container } = renderWithProviders(<ProfitLossView selectedStation={station} />);
    expect(container.querySelector('[data-alert="danger"]')?.textContent).toContain('Net profit');
  });

  it('renders the daily breakdown with the server totals and a Live chip', () => {
    renderWithProviders(<ProfitLossView selectedStation={station} />);
    const table = sectionTable('section-header-daily-breakdown');
    const foot = table.querySelector('tfoot') as HTMLElement;
    expect(within(foot).getByText('Total')).toBeTruthy();
    expect(within(foot).getByText('₹30,000.00')).toBeTruthy();
    expect(within(foot).getByText('₹2,100.00')).toBeTruthy();
    expect(within(table).getAllByText('Live').length).toBe(1);
    // The provisional note names today as a formatted date, never YYYY-MM-DD.
    const note = screen.getByRole('note');
    expect(note.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('renders the product margin table with units, percent and a total', () => {
    renderWithProviders(<ProfitLossView selectedStation={station} />);
    const table = sectionTable('section-header-margin-by-product');
    expect(within(table).getByText('300.00 L')).toBeTruthy();
    expect(within(table).getByText('6 Nos')).toBeTruthy();
    expect(within(table).getByText('−6.7%')).toBeTruthy();
    const foot = table.querySelector('tfoot') as HTMLElement;
    expect(within(foot).getByText('₹2,500.00')).toBeTruthy();
  });

  it('shows the single-day statement with a Final chip and no daily table', () => {
    report = {
      ...periodReport,
      days: [{ date: today, live: false, hasSales: true, ...figures(20000, 18000, 4000, 100) }],
      totals: { ...figures(20000, 18000, 4000, 100), marginPct: 10 },
    };
    renderWithProviders(<ProfitLossView selectedStation={station} />);
    fireEvent.click(screen.getByRole('button', { name: /^Report period/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^Today/ }));

    const header = screen.getByTestId('section-header-statement');
    expect(within(header).getByText('Final')).toBeTruthy();
    expect(screen.queryByTestId('section-header-daily-breakdown')).toBeNull();
    const statement = header.parentElement!;
    expect(within(statement).getByText('Total revenue')).toBeTruthy();
    // A deduction reads as a negative figure in plain ink, never amber.
    expect(within(statement).getByText('−₹16,200.00')).toBeTruthy();
    expect(within(statement).getByText('−₹1,900.00').className).toContain('text-danger-fg');
  });

  it('marks a live single day as Live', () => {
    report = { ...periodReport, days: [periodReport.days[0]] };
    renderWithProviders(<ProfitLossView selectedStation={station} />);
    fireEvent.click(screen.getByRole('button', { name: /^Report period/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^Today/ }));
    const header = screen.getByTestId('section-header-statement');
    expect(within(header).getByText('Live')).toBeTruthy();
  });
});
