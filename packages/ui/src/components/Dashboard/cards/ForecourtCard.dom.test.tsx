// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(screen.getByText(/Live 3h 12m/)).toBeTruthy();
    expect(screen.getByText('5 to hand over by 10:00 pm')).toBeTruthy();
    expect(within(rows[5]).getByTestId('variance-badge').textContent).toBe('Tallied');
  });

  it('past end: Handover due + overdue; 1-DU layout', () => {
    vi.setSystemTime(Date.parse('2026-10-09T22:20:00+05:30'));
    hooks.useShiftStatus.mockReturnValue(ok(live(2, '2026-10-09T08:30:00.000Z')));
    mount('Manager');
    expect(screen.getByText('Past scheduled end')).toBeTruthy();
    expect(screen.getByText('Handover due')).toBeTruthy();
    expect(screen.getByText('1 overdue')).toBeTruthy();
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
