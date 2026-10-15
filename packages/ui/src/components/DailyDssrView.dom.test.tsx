// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { resolveBusinessDate, type Role } from '@pump/shared';
import { renderWithProviders } from '../test/renderWithProviders.js';
import { DailyDssrView } from './DailyDssrView.js';
import { addDays } from '../utils/cashBook.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const station = {
  id: 'st-1',
  name: 'Test Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
};
const today = resolveBusinessDate({ timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' });

type Answer = { data: unknown } | { status: number; code: string };

/** Answers `/dssr/daily/preview?date=…` per date; records every URL asked for. */
function stubPreview(byDate: Record<string, Answer>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const answer = byDate[url.searchParams.get('date') ?? ''] ?? { data: null };
    if ('status' in answer) {
      return new Response(
        JSON.stringify({ success: false, error: { code: answer.code, message: 'no' } }),
        { status: answer.status, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ success: true, data: answer.data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const snapshotRow = (businessDate: string, extra: Record<string, unknown> = {}) => ({
  businessDate,
  generatedAt: `${businessDate}T22:00:00.000Z`,
  snapshotData: {
    shiftsIncluded: 2,
    pnl: {
      revenue: 10000,
      revenueFuel: 9000,
      revenueMerch: 1000,
      cogs: 9000,
      cogsFuel: 8200,
      cogsMerch: 800,
      grossMargin: 1000,
    },
    fuel: {
      totalGrossVolume: 110,
      totalTestingVolume: 10,
      totalNetVolume: 100,
      totalSalesValue: 9000,
      byProduct: [
        {
          productName: 'Petrol',
          productCode: 'MS',
          unit: 'L',
          grossVolume: 110,
          testingVolume: 10,
          netVolume: 100,
          salesValue: 9000,
        },
      ],
      nozzles: [],
    },
    fuelStockVariance: [
      {
        tankName: 'Tank 1',
        productName: 'Petrol',
        unit: 'L',
        expectedQuantity: 1000,
        actualQuantity: 990,
        varianceQuantity: -10,
        status: 'Loss',
      },
    ],
    shifts: [
      {
        shiftId: 's1',
        shiftSequence: 1,
        templateName: 'Morning',
        closedAt: `${businessDate}T08:00:00.000Z`,
        cashVariance: -150,
        attendantVariance: -100,
        netVolume: 100,
      },
    ],
    drawer: { totalCashVariance: -150, totalAttendantVariance: -100, attendants: [] },
    ...extra,
  },
});

/** `null`: no Role passed at all. */
const view = (dailyDssr: unknown, role: Role | null = 'Owner') =>
  renderWithProviders(
    <DailyDssrView
      dailyDssr={dailyDssr}
      station={station}
      userRole={role ?? undefined}
      onBack={() => {}}
    />,
  );

describe('DailyDssrView (ADR 0005: sales-only)', () => {
  it('renders gross margin and ignores office keys left in old snapshots', () => {
    view({
      businessDate: '2026-03-01',
      generatedAt: '2026-03-02T01:00:00.000Z',
      snapshotData: {
        pnl: { revenue: 10000, cogs: 9000, grossMargin: 1000, netProfit: 777, expenses: 223 },
        collections: { total: 4321, Cash: 4321 },
        expenses: { total: 223, drawer: 223 },
        supplierPayments: { drawer: 5, bank: 6 },
        income: { total: 99, tax: { total: 9 } },
      },
    });
    expect(screen.queryByText(/Net Profit/i)).toBeNull();
    expect(screen.queryByText(/Total Collections|Cash Collections/)).toBeNull();
    expect(screen.queryByText(/4,321/)).toBeNull();
    expect(screen.queryByText(/Supplier Payments/i)).toBeNull();
    expect(screen.queryByText(/Operating Expenses/i)).toBeNull();
    expect(screen.getByText('Gross margin')).toBeTruthy();
    // Where the office records live: the info tip at the end of the control bar.
    fireEvent.focus(screen.getByRole('button', { name: 'About the DSR' }));
    expect(screen.getByRole('tooltip').textContent).toMatch(/Accounts → Daily cash book/);
  });

  describe('OMC Card Sales (ADR 0001)', () => {
    const omcView = (snapshotData: Record<string, unknown>) =>
      view({
        businessDate: '2026-10-10',
        generatedAt: '2026-10-11T01:00:00.000Z',
        snapshotData: { credit: { normalCredit: 0, fleetCredit: 34040 }, ...snapshotData },
      });

    it("shows the day's OMC card sales in the sales summary, next to Credit Sales", () => {
      omcView({ omcCard: { total: 2000, count: 1 } });
      expect(screen.getByText('Fleet credit sales')).toBeTruthy();
      const row = screen.getByText('OMC card sales').parentElement as HTMLElement;
      expect(row.textContent).toContain('2,000');
    });

    it('leaves a snapshot frozen before the field, or a day without any, unchanged', () => {
      omcView({});
      expect(screen.queryByText('OMC card sales')).toBeNull();
      cleanup();
      omcView({ omcCard: { total: 0, count: 0 } });
      expect(screen.queryByText('OMC card sales')).toBeNull();
    });
  });
});

describe('DailyDssrView look (#532)', () => {
  it('is a Page Frame titled DSR, with the formatted date and the Sealed state', () => {
    view(snapshotRow('2026-10-09'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('DSR');
    expect(screen.getByText('Sealed')).toBeTruthy();
    expect(screen.getByText(/^09 Oct 2026 · Generated /)).toBeTruthy();
    // No raw YYYY-MM-DD anywhere a reader sees (the date field's value is not text).
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('marks a past open day as a Draft and today as Open', () => {
    view({ ...snapshotRow(addDays(today, -1)), live: true });
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText(/Figures can change until the day is closed/)).toBeTruthy();
    cleanup();
    view({ ...snapshotRow(today), live: true });
    expect(screen.getByText('Open')).toBeTruthy();
  });

  it('puts the day picker, Export and the info tip in one control bar', () => {
    view(snapshotRow('2026-10-09'));
    const bar = screen.getByTestId('control-bar');
    expect(within(bar).getByRole('button', { name: 'Previous day' })).toBeTruthy();
    expect(within(bar).getByLabelText('DSR date')).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Export the DSR' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'About the DSR' })).toBeTruthy();
    // The old Save PDF / Print buttons are items of the Export menu now.
    expect(screen.queryByRole('button', { name: /Save PDF|Print DSR/ })).toBeNull();
  });

  it('reads tables through the Table module: grouped quantities, totals, no tile colour', () => {
    view(snapshotRow('2026-10-09'));
    const tables = screen.getAllByRole('table');
    const fuel = tables[0];
    expect(within(fuel).getByText('Petrol (MS)')).toBeTruthy();
    expect(within(fuel).getAllByText('100.00 L').length).toBeGreaterThan(0);
    expect(fuel.textContent).toContain('Total');
    expect(fuel.textContent).toContain('₹9,000.00');
    expect(document.body.textContent).not.toMatch(/\d\.\d{3} L/);
    // Ordinary money is plain: no tile is alerted, the margin is not green.
    expect(document.querySelector('[data-alert]')).toBeNull();
    expect(document.querySelector('.text-success-fg')).toBeNull();
  });

  it('reads a shortage red with the Short status, and totals the variances', () => {
    view(snapshotRow('2026-10-09'));
    const tank = screen.getByText('Tank 1').closest('tr') as HTMLElement;
    expect(within(tank).getByText('Short')).toBeTruthy();
    expect(within(tank).getByText('−10.00 L').className).toContain('text-danger-fg');
    const shifts = screen.getByText('20261009-1').closest('table') as HTMLElement;
    expect(shifts.textContent).toContain('−₹150.00');
  });

  it('steps to the previous day through the DSR preview', async () => {
    const prev = '2026-10-08';
    const fetchMock = stubPreview({ [prev]: { data: snapshotRow(prev) } });
    view(snapshotRow('2026-10-09'));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(await screen.findByText(/^08 Oct 2026 · Generated /)).toBeTruthy();
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `/dssr/daily/preview?stationId=st-1&date=${prev}`,
    );
  });

  it('shows Report missing for a closed day without a snapshot, with Generate DSR', async () => {
    const prev = '2026-10-08';
    const fetchMock = stubPreview({ [prev]: { status: 409, code: 'CONFLICT' } });
    view(snapshotRow('2026-10-09'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(await screen.findByText('Report missing')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate DSR' })).toBeTruthy();
    // A missing report is an answer: it is not asked for twice.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Export the DSR' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('Generate DSR shows only to Roles the generate route allows', async () => {
    const prev = '2026-10-08';
    for (const role of ['Staff', null] as const) {
      stubPreview({ [prev]: { status: 409, code: 'CONFLICT' } });
      view(snapshotRow('2026-10-09'), role);
      fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
      expect(await screen.findByText('Report missing')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Generate DSR' })).toBeNull();
      expect(screen.getByText(/An owner, manager or accountant can generate it/)).toBeTruthy();
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('Generate DSR sends one Idempotency-Key and refreshes the day it ran on', async () => {
    const prev = '2026-10-08';
    let generated = false;
    const calls: { url: string; method: string; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        calls.push({ url, method: init?.method ?? 'GET', key: headers.get('Idempotency-Key') });
        const json = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
        if (url.includes('/dssr/daily/generate')) {
          generated = true;
          return json(200, { success: true, data: snapshotRow(prev) });
        }
        return generated
          ? json(200, { success: true, data: snapshotRow(prev) })
          : json(409, { success: false, error: { code: 'CONFLICT', message: 'no' } });
      }),
    );
    view(snapshotRow('2026-10-09'), 'Accountant');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Generate DSR' }));
    expect(await screen.findByText(/^08 Oct 2026 · Generated /)).toBeTruthy();
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.url).toContain('/dssr/daily/generate');
    expect(post?.key).toBeTruthy();
    expect(screen.getByText('Sealed')).toBeTruthy();
  });

  it('a row that only names its day is read like any other day', async () => {
    stubPreview({ '2026-10-08': { status: 409, code: 'CONFLICT' } });
    view({ businessDate: '2026-10-08' });
    expect(await screen.findByText('Report missing')).toBeTruthy();
  });

  it('a day that fails to load shows "Couldn\'t load the DSR · Retry"', async () => {
    stubPreview({ '2026-10-08': { status: 500, code: 'INTERNAL' } });
    view(snapshotRow('2026-10-09'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(alert.textContent).toMatch(/^Couldn't load the DSR ·/);
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('a day with no business day reads as no DSR, not an error', async () => {
    stubPreview({});
    view(snapshotRow('2026-10-09'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(await screen.findByText('No DSR for this day')).toBeTruthy();
  });

  it('never goes past today', () => {
    view({ ...snapshotRow(today), live: true });
    expect(screen.getByRole('button', { name: 'Next day' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull();
  });

  it('has no inline styles and no text below 12px', () => {
    for (const file of [
      './DailyDssrView.tsx',
      './reports/DayPicker.tsx',
      './reports/dssr/dssrColumns.tsx',
      './reports/dssr/dssrModel.ts',
    ]) {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(src, file).not.toMatch(/style=\{/);
      expect(src, file).not.toMatch(/text-\[(\d|1[01])(\.\d+)?px\]/);
    }
  });
});
