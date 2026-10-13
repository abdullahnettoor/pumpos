// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Station } from '@pump/shared';
import { stubContainerWidth } from '../testing/containerWidth.js';

const hooks = vi.hoisted(() => ({
  useTankLevelSettings: vi.fn(() => ({ criticalBelowPct: 25, lowBelowPct: 40 })),
  useBusinessDayStatus: vi.fn(),
  useDashboardSummary: vi.fn(),
  useDailyDssrPreview: vi.fn(),
  useInsightsSales: vi.fn(),
  useDailyCashBook: vi.fn(),
  useReceivables: vi.fn(),
  usePayables: vi.fn(),
  // Your shift (Staff) reads these; hidden for other roles, so never asserted here.
  useShiftStatus: vi.fn(),
  useShiftTemplates: vi.fn(),
  useShiftSummaries: vi.fn(),
  useDayActivity: vi.fn(),
  useDensityTodaySummary: vi.fn(),
  useInventoryStatus: vi.fn(),
  useDecantations: vi.fn(),
  useInventoryItems: vi.fn(() => ({ data: undefined, isPending: false, isError: false })),
  usePricing: vi.fn(),
}));
vi.mock('../../../query/hooks.js', () => hooks);

import { Dashboard } from './Dashboard.js';
import { DashboardCard } from './DashboardCard.js';
import { DashboardProvider, useCardEnabled } from './DashboardContext.js';

const STATION = {
  id: 'st-1',
  name: 'Highway',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as unknown as Station;

const ok = (data: unknown) => ({ data, isPending: false, isError: false, refetch: vi.fn() });

let stub: ReturnType<typeof stubContainerWidth>;
beforeEach(() => {
  stub = stubContainerWidth(1300);
  hooks.useBusinessDayStatus.mockReturnValue(ok({ pastOpenBusinessDays: [] }));
  hooks.useDashboardSummary.mockReturnValue(ok({ activeShift: null }));
  hooks.useDailyDssrPreview.mockReturnValue(ok(null));
  hooks.useInsightsSales.mockReturnValue(ok(null));
  hooks.useDailyCashBook.mockReturnValue(ok({ accounts: [] }));
  hooks.useReceivables.mockReturnValue(ok(null));
  hooks.usePayables.mockReturnValue(ok(null));
  hooks.useShiftStatus.mockReturnValue(ok({ activeShift: null, recentClosedShifts: [] }));
  hooks.useShiftTemplates.mockReturnValue(ok([]));
  hooks.useShiftSummaries.mockReturnValue(ok([]));
  hooks.useDayActivity.mockReturnValue(ok({ items: [] }));
  hooks.useDensityTodaySummary.mockReturnValue(ok(undefined));
  hooks.useInventoryStatus.mockReturnValue(ok(undefined));
  hooks.useDecantations.mockReturnValue(ok(undefined));
  hooks.usePricing.mockReturnValue(ok(undefined));
});
afterEach(() => {
  cleanup();
  stub.restore();
  vi.clearAllMocks();
});

const mount = (role: 'Owner' | 'Manager' | 'Accountant' | 'Staff', onNavigate = vi.fn()) =>
  render(<Dashboard station={STATION} role={role} userName="A" onNavigate={onNavigate} />);

describe('board layout', () => {
  it.each([
    [1300, '3'],
    [900, '2'],
    [600, '1'],
  ])('at %ipx renders %s column(s)', (w, cols) => {
    stub.setWidth(w);
    mount('Owner');
    expect(screen.getByTestId('dashboard-board').dataset.columns).toBe(cols);
  });

  it('re-flows when the container resizes', () => {
    mount('Owner');
    const board = screen.getByTestId('dashboard-board');
    expect(board.dataset.columns).toBe('3');
    act(() => stub.setWidth(800));
    expect(board.dataset.columns).toBe('2');
    act(() => stub.setWidth(500));
    expect(board.dataset.columns).toBe('1');
  });
});

describe('Fuels column action', () => {
  it('offers Inventory › to Manager but not Staff', () => {
    mount('Manager');
    expect(screen.getByRole('button', { name: /Inventory/ })).toBeTruthy();
    cleanup();
    mount('Staff');
    expect(screen.queryByRole('button', { name: /Inventory/ })).toBeNull();
  });
});

describe('header', () => {
  it('shows Open shift when none open and navigates', () => {
    const nav = vi.fn();
    mount('Manager', nav);
    // The header and the Forecourt card both offer Open shift; the header's comes first.
    fireEvent.click(screen.getAllByRole('button', { name: /open shift/i })[0]);
    expect(nav).toHaveBeenCalledWith('/shifts');
    expect(screen.getByText(/open since 6:00 am/)).toBeTruthy();
  });

  it('says "as of" when the live data last arrived, not the wall clock', () => {
    hooks.useDashboardSummary.mockReturnValue({
      ...ok({ activeShift: null }),
      dataUpdatedAt: Date.parse('2026-10-12T04:00:00Z'), // 9:30 am IST
    });
    mount('Owner');
    expect(screen.getByText(/as of 9:30 am/)).toBeTruthy();
  });

  it("shows Shift workspace, not Open shift, once the day's shifts are done", () => {
    hooks.useShiftTemplates.mockReturnValue(
      ok([{ id: 't1', name: 'Morning', startTime: '06:00', endTime: '14:00', isActive: true }]),
    );
    hooks.useDashboardSummary.mockReturnValue(
      ok({
        activeShift: null,
        today: {
          shifts: [
            {
              id: 's1',
              shiftTemplateId: 't1',
              openedAt: '2026-10-12T00:30:00Z',
              closedAt: '2026-10-12T08:30:00Z',
            },
          ],
        },
      }),
    );
    mount('Owner');
    expect(screen.getByRole('button', { name: 'Shift workspace' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /open shift/i })).toBeNull();
  });

  it('shows Shift workspace when a shift is open, View shift for Accountant', () => {
    hooks.useDashboardSummary.mockReturnValue(ok({ activeShift: { id: 's' } }));
    mount('Owner');
    expect(screen.getByRole('button', { name: 'Shift workspace' })).toBeTruthy();
    cleanup();
    mount('Accountant');
    expect(screen.getByRole('button', { name: 'View shift' })).toBeTruthy();
  });
});

describe('open-days notice', () => {
  const open = (dates: string[]) =>
    hooks.useBusinessDayStatus.mockReturnValue(
      ok({ pastOpenBusinessDays: dates.map((businessDate) => ({ businessDate })) }),
    );

  it('shows for Owner/Manager/Accountant and links to open past days', () => {
    open(['2026-10-09', '2026-10-10']);
    const nav = vi.fn();
    mount('Accountant', nav);
    expect(screen.getByText(/are still open/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Review in Shifts/));
    expect(nav).toHaveBeenCalledWith('/shifts', { openPastDays: true });
  });

  it('running shift’s own day: info copy, no warning', () => {
    open(['2026-10-13']);
    hooks.useShiftStatus.mockReturnValue(
      ok({ activeShift: { businessDate: '2026-10-13', shiftSequence: 3 } }),
    );
    mount('Owner');
    expect(screen.getByText(/closes after Shift 3 is handed over/)).toBeTruthy();
    expect(screen.queryByText(/still open/)).toBeNull();
    expect(
      document.querySelector('[data-dashboard-card="openDaysNotice"]')!.getAttribute('data-tone'),
    ).toBe('info');
    expect(screen.getByText(/Review in Shifts/)).toBeTruthy();
  });

  it('running shift’s day plus another open day: both sentences', () => {
    open(['2026-10-12', '2026-10-13']);
    hooks.useShiftStatus.mockReturnValue(
      ok({ activeShift: { businessDate: '2026-10-13', shiftSequence: 3 } }),
    );
    mount('Owner');
    expect(screen.getByText(/closes after Shift 3 is handed over/)).toBeTruthy();
    expect(screen.getByText(/is still open/)).toBeTruthy();
  });

  it('is hidden when no past days are open', () => {
    mount('Owner');
    expect(screen.queryByText(/still open/)).toBeNull();
  });

  it('is hidden for Staff and its query is not enabled', () => {
    open(['2026-10-09']);
    mount('Staff');
    expect(screen.queryByText(/still open/)).toBeNull();
    expect(hooks.useBusinessDayStatus).toHaveBeenCalledWith(
      'st-1',
      expect.any(String),
      expect.objectContaining({ enabled: false }),
    );
  });
});

describe('DashboardCard', () => {
  const Probe: React.FC<{
    role: 'Owner' | 'Staff';
    q: { isPending: boolean; isError: boolean; refetch: () => unknown };
  }> = ({ role, q }) => (
    <DashboardProvider
      value={{
        station: STATION,
        role,
        userName: 'A',
        now: new Date(),
        timeZone: 'Asia/Kolkata',
        dayStartsAt: '00:00',
        businessDate: '2026-10-12',
        entryDate: '2026-10-12',
        onNavigate: vi.fn(),
      }}
    >
      <Enabled />
      <DashboardCard card="money" title="Money" query={q} placeholderHeight={100}>
        <span>body</span>
      </DashboardCard>
    </DashboardProvider>
  );
  const Enabled: React.FC = () => <i data-testid="en">{String(useCardEnabled('money'))}</i>;

  it('renders a placeholder while pending, body when ready', () => {
    const { rerender } = render(
      <Probe role="Owner" q={{ isPending: true, isError: false, refetch: vi.fn() }} />,
    );
    expect(screen.getByLabelText('Loading money')).toBeTruthy();
    expect(screen.queryByText('body')).toBeNull();
    rerender(<Probe role="Owner" q={{ isPending: false, isError: false, refetch: vi.fn() }} />);
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('shows error + Retry that refetches, with no page-level state', () => {
    const refetch = vi.fn();
    render(<Probe role="Owner" q={{ isPending: false, isError: true, refetch }} />);
    expect(screen.getByText(/Couldn't load money/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('hidden role: renders nothing and enabled is false', () => {
    render(<Probe role="Staff" q={{ isPending: true, isError: false, refetch: vi.fn() }} />);
    expect(screen.getByTestId('en').textContent).toBe('false');
    expect(screen.queryByLabelText('Loading money')).toBeNull();
  });
});
