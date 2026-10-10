// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import type { AccessDocument } from '@pump/shared';

const calls: number[] = [];
const state: { data: unknown; isError: boolean } = { data: undefined, isError: false };
/** Insights part 2: one read per block, with the days each was asked for. */
const blocks = {
  attendant: { data: undefined as unknown, isError: false, calls: [] as number[] },
  stock: { data: undefined as unknown, isError: false, calls: [] as number[] },
  credit: { data: undefined as unknown, isError: false, calls: [] as number[] },
};
const refetch = vi.fn();

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useInsightsSales: (_id: string, days: number) => {
      calls.push(days);
      return { data: state.data, isError: state.isError, refetch: vi.fn() };
    },
    useInsightsAttendantVariance: (_id: string, days: number) => {
      blocks.attendant.calls.push(days);
      return { data: blocks.attendant.data, isError: blocks.attendant.isError, refetch };
    },
    useInsightsStockLoss: (_id: string, days: number) => {
      blocks.stock.calls.push(days);
      return { data: blocks.stock.data, isError: blocks.stock.isError, refetch };
    },
    useInsightsCreditHealth: (_id: string, days: number) => {
      blocks.credit.calls.push(days);
      return { data: blocks.credit.data, isError: blocks.credit.isError, refetch };
    },
  };
});

const { queryKeys, QueryProvider } = await import('@pump/ui');

const { InsightsScreen } = await import('./InsightsScreen.js');

const station: any = { id: 'st-1', name: 'Highway' };
const report = {
  range: { from: '2026-10-03', to: '2026-10-09' },
  previousRange: { from: '2026-09-26', to: '2026-10-02' },
  closedDays: 2,
  previousClosedDays: 2,
  total: 3227000,
  previousTotal: 3033000,
  changePct: 6.4,
  average: 1613500,
  previousAverage: 1516500,
  best: { date: '2026-10-07', sales: 2000000 },
  trend: [
    { date: '2026-10-07', sales: 2000000, volume: 100, closed: true },
    { date: '2026-10-08', sales: 1227000, volume: 80, closed: true },
  ],
  productMix: [
    { productCode: 'MS', litres: 600, share: 60 },
    { productCode: 'HSD', litres: 400, share: 40 },
  ],
  otherUnitFuels: [] as Array<{ productCode: string; quantity: number; unit: string }>,
  otherProducts: {
    total: 48200,
    previousTotal: 43000,
    changePct: 12,
    top: { name: '20W-40 1L', quantity: 31, revenue: 9300 },
  },
  shiftTemplates: [
    {
      templateId: 'a',
      name: 'Morning',
      shifts: 7,
      avgSales: 212000,
      avgVolume: 2180,
      avgCashVariance: -210,
    },
    {
      templateId: 'b',
      name: 'Evening',
      shifts: 7,
      avgSales: 249000,
      avgVolume: 2560,
      avgCashVariance: 0,
    },
  ],
};

const access = (attendant: boolean): AccessDocument => ({
  plan: 'CORE',
  capabilities: {
    'reports.attendant': attendant
      ? { enabled: true, title: 'Attendant Handover Report' }
      : {
          enabled: false,
          title: 'Attendant Handover Report',
          visibility: 'UPGRADE',
          unavailableMessage: 'Not available for this Organization.',
          resolution: 'CONTACT_PUMPOS',
        },
  },
  limits: { station_count: { value: 1, used: 1, reached: false } },
  subscription: {
    status: 'ACTIVE',
    mode: 'NORMAL',
    accessUntil: null,
    showWarning: false,
    warningMessage: null,
    resolution: null,
  },
});

/** The screen under a query client holding the Organization's Access Document. */
function renderScreen(entitled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(queryKeys.access(), access(entitled));
  return render(
    <QueryProvider client={client}>
      <InsightsScreen station={station} />
    </QueryProvider>,
  );
}

const attendants = [
  {
    attendantId: 'a1',
    name: 'Vinod M',
    shifts: 6,
    shortShifts: 3,
    overShifts: 0,
    netVariance: -1590,
  },
  {
    attendantId: 'a2',
    name: 'Ramesh K',
    shifts: 5,
    shortShifts: 0,
    overShifts: 1,
    netVariance: 120,
  },
  { attendantId: 'a3', name: 'Sajid P', shifts: 4, shortShifts: 0, overShifts: 0, netVariance: 0 },
];
const tanks = [
  {
    tankId: 't1',
    tankName: 'Tank 1',
    productCode: 'MS',
    varianceLitres: -120,
    soldLitres: 15000,
    pctOfSold: -0.8,
    valueAtCost: -10800,
    withinTolerance: false,
  },
  {
    tankId: 't2',
    tankName: 'Tank 2',
    productCode: 'HSD',
    varianceLitres: 6,
    soldLitres: 20000,
    pctOfSold: 0.03,
    valueAtCost: 480,
    withinTolerance: true,
  },
];
const creditHealth = {
  range: { from: '2026-10-03', to: '2026-10-09' },
  creditGiven: 341000,
  collected: 296000,
  receivablesChange: 45000,
  creditShareOfSales: 11,
  closedDays: 7,
  previousCreditGiven: 300000,
  creditGivenChangePct: 13.7,
};

afterEach(() => {
  cleanup();
  calls.length = 0;
  state.data = undefined;
  state.isError = false;
  for (const b of Object.values(blocks)) {
    b.data = undefined;
    b.isError = false;
    b.calls.length = 0;
  }
  refetch.mockClear();
});

describe('InsightsScreen', () => {
  it('renders the blocks from the read model', () => {
    state.data = report;
    renderScreen();
    expect(screen.getByText('₹32.27L')).toBeTruthy();
    expect(screen.getByText(/Wed 7 Oct · ₹20L/)).toBeTruthy();
    expect(screen.getByText('Lubes & others')).toBeTruthy();
    expect(screen.getByText(/Top: 20W-40 1L · ₹9,300/)).toBeTruthy();
    expect(screen.getByText('₹48,200')).toBeTruthy();
    expect(screen.getByText(/Morning · 7 shifts/)).toBeTruthy();
    expect(screen.getByText('−₹210')).toBeTruthy();
  });

  it('gives the trend an accessible summary and hides the decorative bars', () => {
    state.data = report;
    renderScreen();
    const chart = screen.getByRole('img', { name: /Daily sales/ });
    expect(chart.getAttribute('aria-label')).toBe(
      'Daily sales, 3–9 Oct: total ₹32.27L, best day Wed 7 Oct ₹20L',
    );
    expect(chart.querySelectorAll('[aria-hidden="true"]').length).toBe(report.trend.length);
  });

  it('draws a 90-day range as weekly bars, not 90 slivers', () => {
    const start = Date.UTC(2026, 6, 12);
    state.data = {
      ...report,
      range: { from: '2026-07-12', to: '2026-10-09' },
      closedDays: 90,
      trend: Array.from({ length: 90 }, (_, i) => ({
        date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
        sales: 1000 + i,
        volume: 10,
        closed: true,
      })),
    };
    renderScreen();
    const chart = screen.getByRole('img', { name: /Weekly average sales/ });
    expect(chart.children).toHaveLength(13);
    expect(screen.getByText(/Each bar is a week/)).toBeTruthy();
  });

  it('explains why there is no change badge when the periods are not comparable', () => {
    state.data = {
      ...report,
      closedDays: 2,
      previousClosedDays: 7,
      changePct: null,
      otherProducts: { ...report.otherProducts, changePct: null },
    };
    renderScreen();
    expect(screen.queryByText(/vs prior/)).toBeNull();
    expect(screen.getByText(/Not compared with the prior 7 days/)).toBeTruthy();
    expect(screen.getByText(/2 now, 7 before/)).toBeTruthy();
  });

  it('has its own empty state for a range with no fuel or product sales, not a zero Lubes line', () => {
    state.data = {
      ...report,
      productMix: [],
      otherProducts: { total: 0, previousTotal: 0, changePct: null, top: null },
    };
    renderScreen();
    expect(screen.getByText('No fuel or product sales in this range.')).toBeTruthy();
    expect(screen.queryByText('Lubes & others')).toBeNull();
  });

  it('notes non-litre fuel beside the litre mix instead of dropping it', () => {
    state.data = {
      ...report,
      otherUnitFuels: [{ productCode: 'CNG', quantity: 1250.5, unit: 'kg' }],
    };
    renderScreen();
    expect(screen.getByText(/Not in the litre mix/)).toBeTruthy();
    expect(screen.getByText('1,250.5 kg')).toBeTruthy();
  });

  it('hides the Lubes line when only fuel sold, and the litre mix when only products did', () => {
    state.data = {
      ...report,
      otherProducts: { total: 0, previousTotal: 0, changePct: null, top: null },
    };
    const { unmount } = renderScreen();
    expect(screen.queryByText('Lubes & others')).toBeNull();
    expect(screen.getByText('MS')).toBeTruthy();
    unmount();
    state.data = { ...report, productMix: [] };
    renderScreen();
    expect(screen.getByText(/No fuel sold by the litre/)).toBeTruthy();
    expect(screen.getByText('Lubes & others')).toBeTruthy();
  });

  it('rescopes every block when the range changes (one query keyed by days)', () => {
    state.data = report;
    renderScreen();
    expect(calls.at(-1)).toBe(7);
    fireEvent.click(screen.getByRole('radio', { name: '30 days' }));
    expect(calls.at(-1)).toBe(30);
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }));
    expect(calls.at(-1)).toBe(90);
  });

  it('shows an empty state with too little history', () => {
    state.data = { ...report, range: null, closedDays: 0 };
    renderScreen();
    expect(screen.getByText(/No closed Business Days yet/)).toBeTruthy();
    expect(screen.queryByText('Product mix')).toBeNull();
  });

  it('hides the change badge when there is no previous period', () => {
    state.data = {
      ...report,
      changePct: null,
      otherProducts: { ...report.otherProducts, changePct: null },
    };
    renderScreen();
    expect(screen.queryByText(/vs prior/)).toBeNull();
  });

  it('no longer shows alerts, tanks, Team or Organization', () => {
    state.data = report;
    renderScreen();
    for (const t of [/Needs attention/, /Inventory/, /^Team$/, /^Organization$/]) {
      expect(screen.queryByText(t)).toBeNull();
    }
  });
});

describe('InsightsScreen: cash variance by attendant (gated on reports.attendant)', () => {
  it('shows the block, net variance and Shift counts per attendant, when entitled', () => {
    state.data = report;
    blocks.attendant.data = attendants;
    renderScreen(true);
    const block = screen.getByRole('region', { name: 'Cash variance by attendant' });
    expect(within(block).getByText('Vinod M')).toBeTruthy();
    expect(within(block).getByText('−₹1,590')).toBeTruthy();
    expect(within(block).getByText('3 of 6 shifts short')).toBeTruthy();
    expect(within(block).getByText('+₹120')).toBeTruthy();
    expect(within(block).getByText('1 of 5 shifts over')).toBeTruthy();
    expect(within(block).getByText('Balanced in all 4 shifts')).toBeTruthy();
  });

  it('hides the block, and never asks the API for it, without the capability', () => {
    state.data = report;
    blocks.attendant.data = attendants;
    renderScreen(false);
    expect(screen.queryByText('Cash variance by attendant')).toBeNull();
    expect(screen.queryByText('Vinod M')).toBeNull();
    expect(blocks.attendant.calls).toEqual([]);
    // The other blocks do not depend on it.
    expect(blocks.stock.calls.length).toBeGreaterThan(0);
    expect(blocks.credit.calls.length).toBeGreaterThan(0);
  });

  it('shows nothing before the Access Document is known, rather than guessing access', () => {
    state.data = report;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity, enabled: false } },
    });
    render(
      <QueryProvider client={client}>
        <InsightsScreen station={station} />
      </QueryProvider>,
    );
    expect(screen.queryByText('Cash variance by attendant')).toBeNull();
    expect(blocks.attendant.calls).toEqual([]);
  });

  it('says so when no closed Shift has attendant variances', () => {
    state.data = report;
    blocks.attendant.data = [];
    renderScreen();
    expect(screen.getByText(/No closed Shift has attendant variances/)).toBeTruthy();
  });

  it('keeps a failing block from blanking the others, and retries just that block', () => {
    state.data = report;
    blocks.attendant.isError = true;
    blocks.stock.data = tanks;
    renderScreen();
    const block = screen.getByRole('region', { name: 'Cash variance by attendant' });
    fireEvent.click(within(block).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Tank 1')).toBeTruthy();
  });
});

describe('InsightsScreen: stock loss', () => {
  it('shows litres, share of sold, rupees at cost and the tolerance flag per tank', () => {
    state.data = report;
    blocks.stock.data = tanks;
    renderScreen();
    const block = screen.getByRole('region', { name: 'Stock loss' });
    expect(within(block).getByText('−120 L')).toBeTruthy();
    expect(within(block).getByText('0.8% of sold · outside 0.5% tolerance')).toBeTruthy();
    expect(within(block).getByText('−₹10,800')).toBeTruthy();
    expect(within(block).getByText('Outside')).toBeTruthy();
    expect(within(block).getByText('+6 L')).toBeTruthy();
    expect(within(block).getByText('0.03% of sold · within tolerance')).toBeTruthy();
    expect(within(block).getByText('+₹480')).toBeTruthy();
    // Only the tank outside tolerance carries the flag.
    expect(within(block).getAllByText('Outside')).toHaveLength(1);
    expect(within(block).getByText(/cost basis/)).toBeTruthy();
  });

  it('says so when no dip was recorded', () => {
    state.data = report;
    blocks.stock.data = [];
    renderScreen();
    expect(screen.getByText('No tank dips were recorded in this range.')).toBeTruthy();
  });

  it('is shown whatever the Attendant Handover entitlement', () => {
    state.data = report;
    blocks.stock.data = tanks;
    renderScreen(false);
    expect(screen.getByRole('region', { name: 'Stock loss' })).toBeTruthy();
  });
});

describe('InsightsScreen: credit health', () => {
  it('shows credit given, collected, the receivables movement and the credit share', () => {
    state.data = report;
    blocks.credit.data = creditHealth;
    renderScreen();
    const block = screen.getByRole('region', { name: 'Credit health' });
    expect(within(block).getByText('₹3.41L')).toBeTruthy();
    expect(within(block).getByText('₹2.96L')).toBeTruthy();
    expect(within(block).getByText(/Receivables grew/)).toBeTruthy();
    expect(within(block).getByText('₹45,000')).toBeTruthy();
    expect(within(block).getByText('11%')).toBeTruthy();
    expect(within(block).getByText(/13\.7% vs prior 7/)).toBeTruthy();
  });

  it('says receivables shrank when collections outran credit', () => {
    state.data = report;
    blocks.credit.data = { ...creditHealth, collected: 400000, receivablesChange: -59000 };
    renderScreen();
    expect(screen.getByText(/Receivables shrank/)).toBeTruthy();
    expect(screen.getByText('₹59,000')).toBeTruthy();
  });

  it('shows no change badge or share when they are not comparable', () => {
    state.data = report;
    blocks.credit.data = { ...creditHealth, creditGivenChangePct: null, creditShareOfSales: null };
    renderScreen();
    const block = screen.getByRole('region', { name: 'Credit health' });
    expect(within(block).queryByText(/vs prior/)).toBeNull();
    expect(within(block).queryByText(/of sales/)).toBeNull();
  });

  it('says so when no credit moved', () => {
    state.data = report;
    blocks.credit.data = { ...creditHealth, creditGiven: 0, collected: 0, receivablesChange: 0 };
    renderScreen();
    expect(screen.getByText('No credit given or collected in this range.')).toBeTruthy();
  });
});

describe('InsightsScreen: the same range drives every block', () => {
  it('asks each block for the selected days', () => {
    state.data = report;
    renderScreen();
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }));
    for (const b of Object.values(blocks)) expect(b.calls.at(-1)).toBe(90);
  });

  it('does not show the blocks with no closed Business Day', () => {
    state.data = { ...report, range: null, closedDays: 0 };
    renderScreen();
    expect(screen.queryByText('Stock loss')).toBeNull();
    expect(screen.queryByText('Credit health')).toBeNull();
  });
});
