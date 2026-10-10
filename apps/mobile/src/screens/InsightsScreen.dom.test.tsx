// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const calls: number[] = [];
const state: { data: unknown; isError: boolean } = { data: undefined, isError: false };

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useInsightsSales: (_id: string, days: number) => {
      calls.push(days);
      return { data: state.data, isError: state.isError, refetch: vi.fn() };
    },
  };
});

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

afterEach(() => {
  cleanup();
  calls.length = 0;
  state.data = undefined;
  state.isError = false;
});

describe('InsightsScreen', () => {
  it('renders the blocks from the read model', () => {
    state.data = report;
    render(<InsightsScreen station={station} />);
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
    render(<InsightsScreen station={station} />);
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
    render(<InsightsScreen station={station} />);
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
    render(<InsightsScreen station={station} />);
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
    render(<InsightsScreen station={station} />);
    expect(screen.getByText('No fuel or product sales in this range.')).toBeTruthy();
    expect(screen.queryByText('Lubes & others')).toBeNull();
  });

  it('notes non-litre fuel beside the litre mix instead of dropping it', () => {
    state.data = {
      ...report,
      otherUnitFuels: [{ productCode: 'CNG', quantity: 1250.5, unit: 'kg' }],
    };
    render(<InsightsScreen station={station} />);
    expect(screen.getByText(/Not in the litre mix/)).toBeTruthy();
    expect(screen.getByText('1,250.5 kg')).toBeTruthy();
  });

  it('hides the Lubes line when only fuel sold, and the litre mix when only products did', () => {
    state.data = {
      ...report,
      otherProducts: { total: 0, previousTotal: 0, changePct: null, top: null },
    };
    const { unmount } = render(<InsightsScreen station={station} />);
    expect(screen.queryByText('Lubes & others')).toBeNull();
    expect(screen.getByText('MS')).toBeTruthy();
    unmount();
    state.data = { ...report, productMix: [] };
    render(<InsightsScreen station={station} />);
    expect(screen.getByText(/No fuel sold by the litre/)).toBeTruthy();
    expect(screen.getByText('Lubes & others')).toBeTruthy();
  });

  it('rescopes every block when the range changes (one query keyed by days)', () => {
    state.data = report;
    render(<InsightsScreen station={station} />);
    expect(calls.at(-1)).toBe(7);
    fireEvent.click(screen.getByRole('radio', { name: '30 days' }));
    expect(calls.at(-1)).toBe(30);
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }));
    expect(calls.at(-1)).toBe(90);
  });

  it('shows an empty state with too little history', () => {
    state.data = { ...report, range: null, closedDays: 0 };
    render(<InsightsScreen station={station} />);
    expect(screen.getByText(/No closed Business Days yet/)).toBeTruthy();
    expect(screen.queryByText('Product mix')).toBeNull();
  });

  it('hides the change badge when there is no previous period', () => {
    state.data = {
      ...report,
      changePct: null,
      otherProducts: { ...report.otherProducts, changePct: null },
    };
    render(<InsightsScreen station={station} />);
    expect(screen.queryByText(/vs prior/)).toBeNull();
  });

  it('no longer shows alerts, tanks, Team or Organization', () => {
    state.data = report;
    render(<InsightsScreen station={station} />);
    for (const t of [/Needs attention/, /Inventory/, /^Team$/, /^Organization$/]) {
      expect(screen.queryByText(t)).toBeNull();
    }
  });
});
