// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Station } from '@pump/shared';

const hooks = vi.hoisted(() => ({
  useDailyDssrPreview: vi.fn(),
  useInsightsSales: vi.fn(),
  useDailyCashBook: vi.fn(),
  useReceivables: vi.fn(),
  usePayables: vi.fn(),
  useShiftStatus: vi.fn(() => ({
    data: { activeShift: null, recentClosedShifts: [] },
    isPending: false,
    isError: false,
  })),
  useDashboardSummary: vi.fn(() => ({
    data: { activeShift: null },
    isPending: false,
    isError: false,
  })),
  useShiftTemplates: vi.fn(() => ({ data: [], isPending: false, isError: false })),
  useShiftSummaries: vi.fn(() => ({ data: [], isPending: false, isError: false })),
  useDayActivity: vi.fn(() => ({ data: { items: [] }, isPending: false, isError: false })),
  useDensityTodaySummary: vi.fn(() => ({ data: undefined, isPending: false, isError: false })),
  useInventoryStatus: vi.fn(() => ({ data: undefined, isPending: false, isError: false })),
  useInventoryItems: vi.fn(() => ({ data: undefined, isPending: false, isError: false })),
  useBusinessDayStatus: vi.fn(() => ({ data: undefined, isPending: false, isError: false })),
  usePricing: vi.fn(() => ({ data: undefined, isPending: false, isError: false })),
}));
vi.mock('../../../query/hooks.js', () => hooks);

import { MoneyCard } from './MoneyCard.js';
import { ReceivablesPayablesCard } from './ReceivablesPayablesCard.js';
import { TodayInOfficeCard } from './TodayInOfficeCard.js';
import { MoneyColumn } from '../columns/MoneyColumn.js';
import type { OperatorRole } from '@pump/shared';
import { DashboardProvider } from '../frame/DashboardContext.js';

const STATION = {
  id: 'st-1',
  name: 'Highway Station',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as unknown as Station;

const ok = (data: unknown) => ({ data, isPending: false, isError: false, refetch: vi.fn() });
const err = (error = new Error('Network error')) => ({
  data: undefined,
  isPending: false,
  isError: true,
  error,
  refetch: vi.fn(),
});

const mount = (
  ui: React.ReactNode,
  role: OperatorRole = 'Owner',
  onNavigate = vi.fn(),
  businessDate = '2026-10-12',
  entryDate = '2026-10-12',
) =>
  render(
    <DashboardProvider
      value={{
        station: STATION,
        role,
        userName: 'Test User',
        now: new Date(),
        timeZone: 'Asia/Kolkata',
        dayStartsAt: '06:00',
        businessDate,
        entryDate,
        onNavigate,
      }}
    >
      {ui}
    </DashboardProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MoneyCard (Sales so far + 14-day trend)', () => {
  const sampleClosedShiftData = {
    businessDate: '2026-10-12',
    fuel: {
      totalSalesValue: 212880,
      byProduct: [
        {
          productId: 'p-hsd',
          productName: 'Diesel',
          productCode: 'HSD',
          unit: 'L',
          netVolume: 1120,
          salesValue: 100330,
        },
        {
          productId: 'p-ms',
          productName: 'Petrol',
          productCode: 'MS',
          unit: 'L',
          netVolume: 1060,
          salesValue: 109095,
        },
      ],
    },
    merchandise: { salesValue: 6840 },
    pnl: {
      grossMargin: 24800,
      byProduct: [
        {
          productId: 'm1',
          kind: 'merchandise',
          name: 'Engine oil 1L',
          quantity: 14,
          revenue: 6840,
        },
      ],
    },
    credit: { total: 45000 },
    cashInHand: 32000,
    shifts: [
      {
        shiftId: 's1',
        shiftSequence: 1,
        templateName: 'Shift 1',
        netVolume: 2180,
        fuelSalesValue: 212880,
      },
    ],
  };

  const sampleTrendData = {
    closedDays: 14,
    average: 210000,
    changePct: 4.2,
    range: { from: '2026-09-29', to: '2026-10-12' },
    trend: [
      { date: '2026-09-29', sales: 190000, volume: 2000, closed: true },
      { date: '2026-09-30', sales: 200000, volume: 2100, closed: true },
      { date: '2026-10-01', sales: 220000, volume: 2200, closed: true },
      { date: '2026-10-02', sales: 210000, volume: 2150, closed: true },
      { date: '2026-10-03', sales: 230000, volume: 2300, closed: true },
      { date: '2026-10-04', sales: 195000, volume: 2050, closed: true },
      { date: '2026-10-05', sales: 205000, volume: 2100, closed: true },
      { date: '2026-10-06', sales: 215000, volume: 2200, closed: true },
      { date: '2026-10-07', sales: 225000, volume: 2250, closed: true },
      { date: '2026-10-08', sales: 200000, volume: 2100, closed: true },
      { date: '2026-10-09', sales: 210000, volume: 2150, closed: true },
      { date: '2026-10-10', sales: 240000, volume: 2400, closed: true },
      { date: '2026-10-11', sales: 220000, volume: 2200, closed: true },
      { date: '2026-10-12', sales: 212880, volume: 2180, closed: false }, // open draft day
    ],
  };

  it('renders ₹0 and "Fuel counts at shift close" when no closed shift has run', () => {
    hooks.useDailyDssrPreview.mockReturnValue(
      ok({
        fuel: { totalSalesValue: 0, byProduct: [] },
        merchandise: { salesValue: 0 },
        shifts: [], // No closed shifts
      }),
    );
    hooks.useInsightsSales.mockReturnValue(ok({ closedDays: 0, trend: [] }));
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));

    mount(<MoneyCard />);

    expect(screen.getByTestId('sales-headline').textContent).toBe('₹0');
    expect(screen.getByText(/Fuel counts at shift close/)).toBeTruthy();
  });

  it('never includes fuel from an open shift', () => {
    hooks.useDailyDssrPreview.mockReturnValue(
      ok({
        fuel: { totalSalesValue: 0, byProduct: [] }, // running shift has unclosed fuel
        merchandise: { salesValue: 500 }, // live product sale
        shifts: [], // zero closed shifts
      }),
    );
    hooks.useInsightsSales.mockReturnValue(ok({ closedDays: 0, trend: [] }));
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));

    mount(<MoneyCard />);

    // Since zero closed shifts have run, fuel is excluded and copy advises fuel counts at close
    expect(screen.getByTestId('sales-headline').textContent).toBe('₹0');
    expect(screen.getByText(/Fuel counts at shift close/)).toBeTruthy();
  });

  it('renders closed shift fuel + live product sales with comparison', () => {
    hooks.useDailyDssrPreview.mockImplementation((_st, date) => {
      if (date === '2026-10-12') return ok(sampleClosedShiftData);
      return ok({
        shifts: [{ shiftSequence: 1, templateName: 'Shift 1', fuelSalesValue: 200000 }],
      });
    });
    hooks.useInsightsSales.mockReturnValue(ok(sampleTrendData));
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));

    mount(<MoneyCard />);

    // 212,880 + 6,840 = 219,720
    expect(screen.getByTestId('sales-headline').textContent).toContain('2,19,720');
    expect(screen.getByText(/2,180 L/)).toBeTruthy();
    expect(screen.getByText(/fuel \(closed shifts\)/)).toBeTruthy();
    expect(screen.getByText(/products/)).toBeTruthy();
    // Comparison vs Thu/Sun Shift 1
    expect(screen.getByText(/% fuel vs/)).toBeTruthy();
  });

  it('Owner sees Margin; Manager and Accountant do not; Staff sees no cards', () => {
    hooks.useDailyDssrPreview.mockReturnValue(ok(sampleClosedShiftData));
    hooks.useInsightsSales.mockReturnValue(ok(sampleTrendData));
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));

    // 1. Owner sees Margin
    mount(<MoneyCard />, 'Owner');
    expect(screen.getByTestId('margin-tile')).toBeTruthy();
    expect(screen.getByTestId('credit-tile')).toBeTruthy();
    expect(screen.getByTestId('cash-in-hand-tile')).toBeTruthy();
    cleanup();

    // 2. Manager does not see Margin, but sees credit and cash
    mount(<MoneyCard />, 'Manager');
    expect(screen.queryByTestId('margin-tile')).toBeNull();
    expect(screen.getByTestId('credit-tile')).toBeTruthy();
    expect(screen.getByTestId('cash-in-hand-tile')).toBeTruthy();
    cleanup();

    // 3. Accountant does not see Margin, but sees credit and cash
    mount(<MoneyCard />, 'Accountant');
    expect(screen.queryByTestId('margin-tile')).toBeNull();
    expect(screen.getByTestId('credit-tile')).toBeTruthy();
    expect(screen.getByTestId('cash-in-hand-tile')).toBeTruthy();
    cleanup();

    // 4. Staff sees nothing
    mount(<MoneyCard />, 'Staff');
    expect(screen.queryByTestId('sales-headline')).toBeNull();
    expect(screen.queryByTestId('margin-tile')).toBeNull();
  });

  it('shows 14-day trend fallback when closedDays < 3', () => {
    hooks.useDailyDssrPreview.mockReturnValue(ok(sampleClosedShiftData));
    hooks.useInsightsSales.mockReturnValue(ok({ closedDays: 2, trend: [] }));
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));

    mount(<MoneyCard />);

    expect(
      screen.getByText('The 14-day trend appears once 3 business days are closed.'),
    ).toBeTruthy();
  });

  it('renders 14-day trend chart with sealed solid, draft dashed, previous dotted and best day marked', () => {
    hooks.useDailyDssrPreview.mockReturnValue(ok(sampleClosedShiftData));
    hooks.useInsightsSales.mockReturnValue(ok(sampleTrendData));
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));

    const onNavigate = vi.fn();
    mount(<MoneyCard />, 'Owner', onNavigate);

    expect(screen.getByText('Last 14 days')).toBeTruthy();
    expect(screen.getByText(/avg/)).toBeTruthy();
    // Insights link
    const insightsBtn = screen.getByRole('button', { name: 'Insights ›' });
    expect(insightsBtn).toBeTruthy();
    fireEvent.click(insightsBtn);
    expect(onNavigate).toHaveBeenCalledWith('/reports');

    // The chart's geometry (sealed/draft/previous lines, best day) is unit-tested in moneyModel.
    const svg = screen.getByRole('img', { name: /sales trend/i });
    // The stretched SVG would squash a <circle> into an ellipse: the best day is an HTML dot.
    expect(svg.querySelector('circle')).toBeNull();
    expect(screen.getByTestId('trend-best-day')).toBeTruthy();
  });
});

describe('ReceivablesPayablesCard (Receivable / Payable)', () => {
  it('renders empty credit state for new station with Add customer link', () => {
    hooks.useReceivables.mockReturnValue(
      ok({
        total: 0,
        customerCount: 0,
        aging: { d0_7: 0, d8_30: 0, d30plus: 0 },
      }),
    );
    hooks.usePayables.mockReturnValue(ok({ total: 15000, supplierCount: 2 }));

    const onNavigate = vi.fn();
    mount(<ReceivablesPayablesCard />, 'Owner', onNavigate);

    expect(screen.getByText('Receivable')).toBeTruthy();
    expect(screen.getByTestId('receivables-total').textContent).toContain('0');
    expect(screen.getByText(/No credit customers yet/)).toBeTruthy();

    const addBtn = screen.getByRole('button', { name: 'Add customer ›' });
    fireEvent.click(addBtn);
    expect(onNavigate).toHaveBeenCalledWith('/customers', { open: 'new-customer' });

    expect(screen.getByText('Payable')).toBeTruthy();
    expect(screen.getByTestId('payables-total').textContent).toContain('15,000');
  });

  it('renders aging breakdown and stacked progress bar when receivables exist', () => {
    hooks.useReceivables.mockReturnValue(
      ok({
        total: 125000,
        customerCount: 5,
        aging: { d0_7: 75000, d8_30: 35000, d30plus: 15000 },
      }),
    );
    hooks.usePayables.mockReturnValue(ok({ total: 50000, supplierCount: 3 }));

    mount(<ReceivablesPayablesCard />);

    expect(screen.getByTestId('receivables-total').textContent).toContain('1,25,000');
    expect(screen.getByRole('progressbar', { name: 'Receivables aging' })).toBeTruthy();
    expect(screen.getByText(/0–7d/)).toBeTruthy();
    expect(screen.getByText(/8–30d/)).toBeTruthy();
    expect(screen.getByText(/30d\+/)).toBeTruthy();
    expect(screen.getByTestId('payables-total').textContent).toContain('50,000');
  });
});

describe('TodayInOfficeCard (Today in the office)', () => {
  it('renders empty state when no entries recorded today', () => {
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));

    mount(<TodayInOfficeCard />);

    expect(screen.getByTestId('empty-office-records').textContent).toContain(
      'Nothing recorded yet today.',
    );
    // The Cash Book link lives once, in the Money column header.
    expect(screen.queryByRole('button', { name: 'Daily cash book ›' })).toBeNull();
  });

  it('renders latest 3 records and entry count with link to Cash Book', () => {
    hooks.useDailyCashBook.mockReturnValue(
      ok({
        accounts: [
          {
            id: 'acc-1',
            name: 'Cash in Hand',
            accountType: 'CASH_IN_HAND',
            entries: [
              {
                id: 'e1',
                direction: 'in',
                amount: 25000,
                sourceType: 'COLLECTION',
                notes: 'Sree Transports',
                createdAt: '2026-10-12T09:00:00Z',
              },
              {
                id: 'e2',
                direction: 'out',
                amount: 4200,
                sourceType: 'EXPENSE',
                notes: 'Generator diesel',
                createdAt: '2026-10-12T11:00:00Z',
              },
            ],
          },
          {
            id: 'acc-2',
            name: 'Federal Bank',
            accountType: 'BANK',
            entries: [
              {
                id: 'e3',
                direction: 'in',
                amount: 13500,
                sourceType: 'COLLECTION',
                notes: 'Calicut Cabs',
                createdAt: '2026-10-12T10:00:00Z',
              },
              {
                id: 'e4',
                direction: 'out',
                amount: 1500,
                sourceType: 'BANK_CHARGE',
                notes: 'SMS alert charges',
                createdAt: '2026-10-12T08:00:00Z',
              },
            ],
          },
        ],
      }),
    );

    const onNavigate = vi.fn();
    mount(<TodayInOfficeCard />, 'Owner', onNavigate);

    expect(screen.getByTestId('entries-count').textContent).toContain('4 entries');
    expect(screen.getByText(/Generator diesel/)).toBeTruthy();
    expect(screen.getByText(/Calicut Cabs/)).toBeTruthy();
    expect(screen.getByText(/Sree Transports/)).toBeTruthy();

    // Money outflow uses a true minus, inflow a plus.
    expect(screen.getByTestId('office-records-list').textContent).toContain('−₹4,200');
    expect(screen.getByTestId('office-records-list').textContent).not.toContain('-₹');
    expect(screen.queryByRole('button', { name: 'Daily cash book ›' })).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('prints a zero entry as a plain, untoned ₹0', () => {
    hooks.useDailyCashBook.mockReturnValue(
      ok({
        accounts: [
          {
            id: 'acc-1',
            name: 'Cash in Hand',
            accountType: 'CASH_IN_HAND',
            entries: [
              {
                id: 'z',
                direction: 'in',
                amount: 0,
                sourceType: 'ADJUSTMENT',
                notes: 'Recount',
                createdAt: '2026-10-12T09:00:00Z',
              },
            ],
          },
        ],
      }),
    );
    mount(<TodayInOfficeCard />);
    const list = screen.getByTestId('office-records-list').textContent ?? '';
    expect(list).toContain('₹0');
    expect(list).not.toContain('+₹0');
    // Neither money in (green) nor money out (red).
    expect(screen.getByText('₹0').className).toContain('text-ink-muted');
  });

  it('the Money column header carries the single Daily cash book link', () => {
    hooks.useDailyDssrPreview.mockReturnValue(ok(null));
    hooks.useInsightsSales.mockReturnValue(ok(null));
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));
    hooks.useReceivables.mockReturnValue(ok({ total: 0, customerCount: 0 }));
    hooks.usePayables.mockReturnValue(ok({ total: 0 }));
    const onNavigate = vi.fn();
    mount(<MoneyColumn />, 'Owner', onNavigate);
    const links = screen.getAllByRole('button', { name: 'Daily cash book ›' });
    expect(links).toHaveLength(1);
    fireEvent.click(links[0]!);
    expect(onNavigate).toHaveBeenCalledWith('/accounts', { openAccountsTab: 'cash-book' });
  });
});

describe('Money trend states and cash in hand', () => {
  const closedShift = {
    fuel: { totalSalesValue: 100, byProduct: [] },
    merchandise: { salesValue: 0 },
    cashInHand: 999999,
    shifts: [{ shiftSequence: 1, templateName: 'Shift 1', fuelSalesValue: 100 }],
  };
  const day = (d: number, sales: number, closed = true) => ({
    date: `2026-10-${String(d).padStart(2, '0')}`,
    sales,
    volume: 0,
    closed,
  });
  const trendOk = {
    closedDays: 5,
    average: 150,
    changePct: 1,
    range: { from: '2026-10-01', to: '2026-10-05' },
    trend: [day(1, 100), day(2, 140), day(3, 120), day(4, 160, false)],
    previousTrend: [day(1, 90), day(2, 110), day(3, 0, false), day(4, 105)],
  };

  beforeEach(() => {
    hooks.useDailyDssrPreview.mockReturnValue(ok(closedShift));
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));
  });

  it('shows a placeholder while the trend loads, not the history message', () => {
    hooks.useInsightsSales.mockReturnValue({ data: undefined, isPending: true, isError: false });
    mount(<MoneyCard />);
    expect(screen.getByTestId('trend-placeholder')).toBeTruthy();
    expect(screen.queryByText(/appears once 3 business days/)).toBeNull();
  });

  it('shows an inline Retry when the trend fails; the hero stays', () => {
    const e = err();
    hooks.useInsightsSales.mockReturnValue(e);
    mount(<MoneyCard />);
    expect(screen.getByTestId('sales-headline')).toBeTruthy();
    expect(screen.queryByText(/appears once 3 business days/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(e.refetch).toHaveBeenCalled();
  });

  it('shows the history message only with fewer than 3 closed days', () => {
    hooks.useInsightsSales.mockReturnValue(ok({ closedDays: 2, trend: [] }));
    mount(<MoneyCard />);
    expect(screen.getByText(/appears once 3 business days/)).toBeTruthy();
  });

  it('draws the previous period series dotted, with gaps skipped', () => {
    hooks.useInsightsSales.mockReturnValue(ok(trendOk));
    mount(<MoneyCard />);
    const dotted = document.querySelector('path[stroke-dasharray="2 3"]');
    expect(dotted).toBeTruthy();
    // 3 sealed previous points, one gap: two sub-paths.
    expect(dotted!.getAttribute('d')!.match(/M/g)).toHaveLength(2);
  });

  it('Staff see no trend', () => {
    hooks.useInsightsSales.mockReturnValue(ok(trendOk));
    mount(<MoneyCard />, 'Staff');
    expect(screen.queryByRole('img', { name: /sales trend/i })).toBeNull();
  });

  it('Cash in hand comes only from the Cash Book, never the DSSR preview', () => {
    hooks.useInsightsSales.mockReturnValue(ok(trendOk));
    mount(<MoneyCard />);
    expect(screen.getByTestId('cash-in-hand-tile').textContent).toContain('—');
    cleanup();
    hooks.useDailyCashBook.mockReturnValue(
      ok({ accounts: [{ accountType: 'CASH_IN_HAND', closing: 4200, entries: [] }] }),
    );
    mount(<MoneyCard />);
    expect(screen.getByTestId('cash-in-hand-tile').textContent).toContain('₹4.2k');
  });
});

describe('Independent Failure Isolation in MoneyColumn', () => {
  it('Receivables card fails independently of Sales card and Office card', () => {
    // Sales succeeds
    hooks.useDailyDssrPreview.mockReturnValue(
      ok({
        shifts: [{ shiftSequence: 1, templateName: 'Shift 1', fuelSalesValue: 100000 }],
        fuel: { totalSalesValue: 100000, byProduct: [] },
        merchandise: { salesValue: 0 },
      }),
    );
    hooks.useInsightsSales.mockReturnValue(ok({ closedDays: 5, average: 100000, trend: [] }));

    // Receivables FAILS
    hooks.useReceivables.mockReturnValue(err());
    hooks.usePayables.mockReturnValue(ok({ total: 1000 }));

    // Cash book succeeds
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));

    mount(<MoneyColumn />, 'Owner');

    // Sales card is ready and visible!
    expect(screen.getByTestId('sales-headline')).toBeTruthy();

    // Receivables card shows error and Retry!
    expect(screen.getByText(/Couldn't load receivable \/ payable/)).toBeTruthy();

    // Office card is ready and visible!
    expect(screen.getByTestId('empty-office-records')).toBeTruthy();
  });
});

describe('Office reads use the Entry Date, not the Business Date (ADR 0005)', () => {
  it('queries the Cash Book by entry date before Day Start', () => {
    hooks.useDailyDssrPreview.mockReturnValue(ok(null));
    hooks.useInsightsSales.mockReturnValue(ok(null));
    hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));
    mount(<MoneyCard />, 'Owner', vi.fn(), '2026-10-11', '2026-10-12');
    expect(hooks.useDailyCashBook).toHaveBeenCalledWith('st-1', '2026-10-12', expect.anything());
  });
});
