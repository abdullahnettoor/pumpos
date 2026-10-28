// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Station } from '@pump/shared';

const hooks = vi.hoisted(() => ({
  useTankLevelSettings: vi.fn(() => ({ criticalBelowPct: 25, lowBelowPct: 40 })),
  useShiftStatus: vi.fn(),
  useDashboardSummary: vi.fn(),
  useShiftTemplates: vi.fn(),
  useDensityTodaySummary: vi.fn(),
  useInventoryStatus: vi.fn(),
  useInventoryItems: vi.fn(),
  useReceivables: vi.fn(),
  useBusinessDayStatus: vi.fn(),
}));
vi.mock('../../../query/hooks.js', () => hooks);

import { YourShiftCard } from './YourShiftCard.js';
import type { OperatorRole } from '@pump/shared';
import { DashboardProvider } from '../frame/DashboardContext.js';

const STATION = {
  id: 'st-1',
  name: 'Highway',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as unknown as Station;

const ok = (data: unknown) => ({ data, isPending: false, isError: false, refetch: vi.fn() });
const pending = () => ({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });
const failed = () => ({ data: undefined, isPending: false, isError: true, refetch: vi.fn() });

const TEMPLATES = [
  { id: 't1', name: 'Shift 1', startTime: '06:00', endTime: '14:00', isActive: true },
  { id: 't2', name: 'Shift 2', startTime: '14:00', endTime: '22:00', isActive: true },
];
const MORNING_CLOSED = {
  id: 's1',
  shiftTemplateId: 't1',
  openedAt: '2026-10-12T00:30:00.000Z',
  closedAt: '2026-10-12T08:30:00.000Z',
};
const NO_DENSITY_GAP = { missingCount: 0, missingProducts: [] };

// 2026-10-12 15:00 IST (the shift's scheduled end, 14:00, has passed)
const AT_3PM_IST = Date.parse('2026-10-12T09:30:00.000Z');

const openShift = (over: Record<string, unknown> = {}) => ({
  openedAt: '2026-10-12T00:30:00.000Z', // 6:00 am IST
  scheduledEndTime: '14:00',
  staffAssignments: [
    { userId: 'u1', duId: 'd1', duName: 'DU 1' },
    { userId: 'u2', duId: 'd2', duName: 'DU 2' },
  ],
  handovers: [],
  ...over,
});

function mount(role: OperatorRole = 'Staff', onNavigate = vi.fn()) {
  return render(
    <DashboardProvider
      value={{
        station: STATION,
        role,
        userName: 'Sam',
        now: new Date(),
        timeZone: 'Asia/Kolkata',
        dayStartsAt: '06:00',
        businessDate: '2026-10-12',
        entryDate: '2026-10-12',
        onNavigate,
      }}
    >
      <YourShiftCard />
    </DashboardProvider>,
  );
}

function givenData(over: Partial<Record<keyof typeof hooks, unknown>> = {}) {
  hooks.useShiftStatus.mockReturnValue(ok({ activeShift: openShift() }));
  hooks.useDashboardSummary.mockReturnValue(ok({ today: { shifts: [] } }));
  hooks.useShiftTemplates.mockReturnValue(ok(TEMPLATES));
  hooks.useDensityTodaySummary.mockReturnValue(ok(NO_DENSITY_GAP));
  hooks.useInventoryStatus.mockReturnValue(ok([]));
  hooks.useInventoryItems.mockReturnValue(ok([]));
  hooks.useReceivables.mockReturnValue(ok(undefined));
  hooks.useBusinessDayStatus.mockReturnValue(ok(undefined));
  Object.entries(over).forEach(([k, v]) =>
    (hooks[k as keyof typeof hooks] as any).mockReturnValue(v),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT_3PM_IST);
  givenData();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('YourShiftCard — states', () => {
  it('shows overdue handovers past the scheduled end with an Open action', () => {
    const onNavigate = vi.fn();
    mount('Staff', onNavigate);
    expect(screen.getByText('2 handovers overdue')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onNavigate).toHaveBeenCalledWith('/shifts');
  });

  it('counts handovers still to record while the shift is running', () => {
    givenData({
      useShiftStatus: ok({
        activeShift: openShift({
          scheduledEndTime: '23:00',
          handovers: [{ userId: 'u1', duId: 'd1' }],
        }),
      }),
    });
    mount();
    expect(screen.getByText('1 handover to record')).toBeTruthy();
  });

  it('offers Open Shift N between shifts', () => {
    givenData({
      useShiftStatus: ok({ activeShift: null }),
      useDashboardSummary: ok({ today: { shifts: [MORNING_CLOSED] } }),
    });
    mount();
    expect(screen.getByText('Open Shift 2')).toBeTruthy();
  });

  it('does not offer a skipped window that has already passed', () => {
    vi.setSystemTime(Date.parse('2026-10-12T17:30:00.000Z')); // 11:00 pm IST, Shift 2 window over
    givenData({
      useShiftStatus: ok({ activeShift: null }),
      useDashboardSummary: ok({ today: { shifts: [MORNING_CLOSED] } }),
    });
    mount();
    expect(screen.queryByText(/Open Shift/)).toBeNull();
  });

  it('offers Open Shift 1 on the first Business Day', () => {
    givenData({ useShiftStatus: ok({ activeShift: null }) });
    mount();
    expect(screen.getByText('Open Shift 1')).toBeTruthy();
  });

  it('lists unrecorded morning density with a Record action that opens the density register', () => {
    givenData({
      useDensityTodaySummary: ok({
        missingCount: 1,
        missingProducts: [{ productId: 'p1', productName: 'Petrol', productCode: 'PET' }],
      }),
    });
    const onNavigate = vi.fn();
    mount('Staff', onNavigate);
    const row = screen.getByText('Morning density not recorded').parentElement!.parentElement!;
    expect(within(row).getByText('Petrol')).toBeTruthy();
    expect(within(row).queryByText(/tell the manager/)).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Record' }));
    expect(onNavigate).toHaveBeenCalledWith('/inventory', { focusInventoryTab: 'density' });
  });

  it('shows a count chip for the to-do list and renders no cash drops', () => {
    givenData({
      useDensityTodaySummary: ok({
        missingCount: 1,
        missingProducts: [{ productId: 'p1', productName: 'Petrol', productCode: 'PET' }],
      }),
    });
    mount();
    expect(screen.getByLabelText('2 to do').textContent).toBe('2');
    expect(screen.queryByText(/Cash drops/i)).toBeNull();
    expect(screen.queryByText(/₹/)).toBeNull();
  });

  it('shows the loading placeholder while its reads are pending', () => {
    givenData({ useShiftStatus: pending() });
    mount();
    expect(screen.getByLabelText('Loading your shift')).toBeTruthy();
  });

  it('shows a card-level error with retry when its shift read fails', () => {
    givenData({ useShiftStatus: failed() });
    mount();
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load your shift");
  });

  it('is hidden for non-Staff roles and fetches nothing', () => {
    mount('Owner');
    expect(screen.queryByText('Your shift')).toBeNull();
    for (const h of [
      hooks.useShiftStatus,
      hooks.useDashboardSummary,
      hooks.useShiftTemplates,
      hooks.useDensityTodaySummary,
    ]) {
      expect(h.mock.calls.length).toBeGreaterThan(0);
      for (const call of h.mock.calls) expect(call.at(-1)).toMatchObject({ enabled: false });
    }
  });
});
