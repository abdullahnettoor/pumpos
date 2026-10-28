// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Station } from '@pump/shared';

const hooks = vi.hoisted(() => ({
  useShiftStatus: vi.fn(),
  useDashboardSummary: vi.fn(),
  useShiftTemplates: vi.fn(),
}));
vi.mock('../../../query/hooks.js', () => hooks);

import { DashboardProvider } from '../frame/DashboardContext.js';
import { ForecourtColumn } from '../columns/ForecourtColumn.js';
import { ForecourtCard } from './ForecourtCard.js';

const STATION = { id: 'st-1', name: 'Hwy', settings: {} } as unknown as Station;
const ok = (data: unknown) => ({ data, isPending: false, isError: false, refetch: vi.fn() });
const TEMPLATES = [
  { id: 't1', name: 'Shift 1', startTime: '06:00', endTime: '14:00', isActive: true },
  { id: 't2', name: 'Shift 2', startTime: '14:00', endTime: '22:00', isActive: true },
];

const du = (n: number) => ({
  id: `a${n}`,
  userId: `u${n}`,
  duId: `d${n}`,
  duName: `DU${n}`,
  userName: `Att ${n}`,
  openingFloat: 1000,
});
const live = (count: number, opened: string) => ({
  activeShift: {
    id: 's2',
    templateName: 'Shift 2',
    openedAt: opened,
    scheduledEndTime: '22:00',
    shiftTemplateId: 't2',
    staffAssignments: Array.from({ length: count }, (_, i) => du(i + 1)),
    handovers: [
      { userId: 'u1', duId: 'd1', cashHandedOver: '900', varianceAmount: '0', cashDrops: '0' },
    ],
    nozzleReadings: [{ duId: 'd2', nozzleName: 'N2', productCode: 'HSD' }],
    reconciliation: { openingFloat: count * 1000, handoverCashDrops: 0 },
  },
});

function mount(
  role: 'Owner' | 'Manager' | 'Accountant' | 'Staff',
  nav = vi.fn(),
  ui: React.ReactNode = <ForecourtCard />,
) {
  render(
    <DashboardProvider
      value={{
        station: STATION,
        role,
        userName: 'A',
        now: new Date(),
        timeZone: 'Asia/Kolkata',
        dayStartsAt: '06:00',
        businessDate: '2026-10-09',
        entryDate: '2026-10-09',
        onNavigate: nav,
      }}
    >
      {ui}
    </DashboardProvider>,
  );
  return nav;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  hooks.useShiftTemplates.mockReturnValue(ok(TEMPLATES));
  hooks.useDashboardSummary.mockReturnValue(ok({ lastShift: null, today: { shifts: [] } }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ForecourtCard live', () => {
  it('busy: Pending badges, unrecorded DUs first, 6 DUs', () => {
    vi.setSystemTime(Date.parse('2026-10-09T17:12:00+05:30'));
    hooks.useShiftStatus.mockReturnValue(ok(live(6, '2026-10-09T08:30:00.000Z')));
    mount('Owner');
    const rows = screen.getAllByTestId('du-row');
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.dataset.status)).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'recorded',
    ]);
    expect(screen.getAllByText('Pending')).toHaveLength(5);
    expect(screen.getByText('1 / 6')).toBeTruthy();
    expect(screen.queryByText(/Drops/)).toBeNull();
    expect(screen.queryByText('dropped')).toBeNull();
    expect(rows[0].textContent).not.toMatch(/₹/);
    expect(screen.getByText(/Live 3h 12m/)).toBeTruthy();
    expect(screen.getByText('5 to hand over by 10:00 pm')).toBeTruthy();
    expect(within(rows[5]).getByTestId('variance-badge').textContent).toBe('Balanced');
  });

  it('variance chips: a surplus is amber, under half a paisa reads Balanced (#518)', () => {
    vi.setSystemTime(Date.parse('2026-10-09T17:12:00+05:30'));
    const shift = live(3, '2026-10-09T08:30:00.000Z');
    shift.activeShift.handovers = [
      { userId: 'u1', duId: 'd1', cashHandedOver: '900', varianceAmount: '0.004', cashDrops: '0' },
      { userId: 'u2', duId: 'd2', cashHandedOver: '900', varianceAmount: '120', cashDrops: '0' },
      { userId: 'u3', duId: 'd3', cashHandedOver: '900', varianceAmount: '-40', cashDrops: '0' },
    ];
    hooks.useShiftStatus.mockReturnValue(ok(shift));
    mount('Owner');
    const chips = screen.getAllByTestId('variance-badge');
    const byText = (t: string) => chips.find((c) => c.textContent === t)!;
    expect(byText('Balanced').className).toContain('text-success-fg');
    expect(byText('+₹120.00').className).toContain('text-warning-fg');
    expect(byText('\u2212₹40.00').className).toContain('text-danger-fg');
  });

  it('past end: Handover due + overdue; 1-DU layout', () => {
    vi.setSystemTime(Date.parse('2026-10-09T22:20:00+05:30'));
    hooks.useShiftStatus.mockReturnValue(ok(live(2, '2026-10-09T08:30:00.000Z')));
    mount('Manager');
    expect(screen.getByText('Past scheduled end')).toBeTruthy();
    expect(screen.getByText('Handover due')).toBeTruthy();
    expect(screen.getByText('1 overdue')).toBeTruthy();
  });

  it('carry-over shift of an earlier day carries its date', () => {
    vi.setSystemTime(Date.parse('2026-10-09T17:12:00+05:30'));
    const l = live(3, '2026-10-09T08:30:00.000Z');
    hooks.useShiftStatus.mockReturnValue(
      ok({ activeShift: { ...l.activeShift, businessDate: '2026-10-08', shiftSequence: 3 } }),
    );
    mount('Manager', vi.fn(), <ForecourtColumn />);
    expect(screen.getByText(/Live 3h 12m · Shift 3 · 8 Oct/)).toBeTruthy();
    expect(screen.getByText('Shift 3 · 8 Oct · 3 DUs')).toBeTruthy();
  });

  it('column header: Accountant sees View › and Staff Workspace ›', () => {
    vi.setSystemTime(Date.parse('2026-10-09T17:12:00+05:30'));
    hooks.useShiftStatus.mockReturnValue(ok(live(1, '2026-10-09T08:30:00.000Z')));
    mount('Accountant', vi.fn(), <ForecourtColumn />);
    expect(screen.getByText('View ›')).toBeTruthy();
    cleanup();
    mount('Staff', vi.fn(), <ForecourtColumn />);
    expect(screen.getByText('Workspace ›')).toBeTruthy();
  });
});

describe('ForecourtCard idle', () => {
  const idleSummary = {
    lastShift: { id: 's1', templateName: 'Shift 1' },
    lastShiftSummary: { totalFuelSalesValue: 216120, totalVolumeSold: 2211, cashVariance: -340 },
    today: {
      shifts: [
        {
          shiftTemplateId: 't1',
          openedAt: '2026-10-09T00:30:00.000Z',
          closedAt: '2026-10-09T08:22:00.000Z',
        },
      ],
    },
  };

  it('between shifts: next window, last closed, Open shift for Manager', () => {
    vi.setSystemTime(Date.parse('2026-10-09T14:10:00+05:30'));
    hooks.useShiftStatus.mockReturnValue(ok({ activeShift: null }));
    hooks.useDashboardSummary.mockReturnValue(ok(idleSummary));
    const nav = mount('Manager');
    expect(screen.getByText('Between shifts')).toBeTruthy();
    expect(screen.getByText('Shift 2 is scheduled from 2:00 pm.')).toBeTruthy();
    expect(screen.getByTestId('last-closed').textContent).toContain('2,211');
    fireEvent.click(screen.getByRole('button', { name: 'Open shift' }));
    expect(nav).toHaveBeenCalledWith('/shifts');
    fireEvent.click(screen.getByText('Summary ›'));
    expect(nav).toHaveBeenCalledWith('/shifts', { openShiftSummaryId: 's1' });
  });

  it('day done: Day’s shifts done, no Open shift, even for Owner', () => {
    vi.setSystemTime(Date.parse('2026-10-09T23:00:00+05:30'));
    hooks.useShiftStatus.mockReturnValue(ok({ activeShift: null }));
    hooks.useDashboardSummary.mockReturnValue(
      ok({
        ...idleSummary,
        lastShift: { id: 's2', templateName: 'Shift 2', businessDate: '2026-10-08' },
        today: {
          shifts: [
            {
              shiftTemplateId: 't1',
              openedAt: '2026-10-09T00:30:00.000Z',
              closedAt: '2026-10-09T08:22:00.000Z',
            },
            {
              shiftTemplateId: 't2',
              openedAt: '2026-10-09T08:30:00.000Z',
              closedAt: '2026-10-09T16:30:00.000Z',
            },
          ],
        },
      }),
    );
    mount('Owner');
    expect(screen.getByText('Day’s shifts done')).toBeTruthy();
    expect(screen.queryByText('Between shifts')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open shift' })).toBeNull();
    expect(screen.getByTestId('last-closed').textContent).toContain('Shift 2 · Thu 8 Oct');
  });

  it('no shift open: Owner gets a primary Open shift', () => {
    vi.setSystemTime(Date.parse('2026-10-09T06:20:00+05:30'));
    hooks.useShiftStatus.mockReturnValue(ok({ activeShift: null }));
    mount('Owner');
    expect(screen.getByRole('button', { name: 'Open shift' })).toBeTruthy();
  });

  it('no shift open: no Open shift for Accountant', () => {
    vi.setSystemTime(Date.parse('2026-10-09T06:20:00+05:30'));
    hooks.useShiftStatus.mockReturnValue(ok({ activeShift: null }));
    mount('Accountant');
    expect(screen.getByText('No shift running')).toBeTruthy();
    expect(screen.getByText('Shift 1 is scheduled from 6:00 am.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open shift' })).toBeNull();
  });
});

describe('ForecourtCard query states', () => {
  it('error shows Retry; loading shows placeholder', () => {
    hooks.useShiftStatus.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    });
    mount('Owner');
    expect(screen.getByText('Retry')).toBeTruthy();
    cleanup();
    hooks.useShiftStatus.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });
    mount('Owner');
    expect(document.querySelector('[data-state="loading"]')).toBeTruthy();
  });

  it('Attendant: card hidden, queries disabled', () => {
    hooks.useShiftStatus.mockReturnValue(ok({ activeShift: null }));
    mount('Attendant' as never);
    expect(screen.queryByText('Forecourt')).toBeNull();
    expect(hooks.useShiftStatus).toHaveBeenCalledWith('st-1', { enabled: false });
  });
});
