// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Station } from '@pump/shared';

const hooks = vi.hoisted(() => ({
  useShiftStatus: vi.fn(),
  useDashboardSummary: vi.fn(),
  useShiftTemplates: vi.fn(),
  useDensityTodaySummary: vi.fn(),
  useInventoryStatus: vi.fn(),
  useInventoryItems: vi.fn(),
}));
vi.mock('../../../query/hooks.js', () => hooks);

import { YourShiftCard } from './YourShiftCard.js';
import { DashboardProvider, type DashboardRole } from '../frame/DashboardContext.js';

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

function mount(role: DashboardRole = 'Staff', onNavigate = vi.fn()) {
  return render(
    <DashboardProvider
      value={{
        station: STATION,
        role,
        userName: 'Sam',
        timeZone: 'Asia/Kolkata',
        dayStartsAt: '06:00',
        businessDate: '2026-10-12',
        onNavigate,
      }}
    >
      <YourShiftCard />
    </DashboardProvider>,
  );
}

function givenData(over: Partial<Record<keyof typeof hooks, unknown>> = {}) {
  hooks.useShiftStatus.mockReturnValue(ok({ activeShift: openShift() }));
  hooks.useDashboardSummary.mockReturnValue(ok({ today: { shiftsClosed: 0 } }));
  hooks.useShiftTemplates.mockReturnValue(ok(TEMPLATES));
  hooks.useDensityTodaySummary.mockReturnValue(ok(NO_DENSITY_GAP));
  hooks.useInventoryStatus.mockReturnValue(ok([]));
  hooks.useInventoryItems.mockReturnValue(ok([]));
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

  it('offers Open Shift N between shifts, with no open shift and no cash drops', () => {
    givenData({
      useShiftStatus: ok({ activeShift: null }),
      useDashboardSummary: ok({ today: { shiftsClosed: 1 } }),
    });
    mount();
    expect(screen.getByText('Open Shift 2')).toBeTruthy();
    expect(screen.getByText('No shift open.')).toBeTruthy();
  });

  it('offers Open Shift 1 on the first Business Day', () => {
    givenData({ useShiftStatus: ok({ activeShift: null }) });
    mount();
    expect(screen.getByText('Open Shift 1')).toBeTruthy();
  });

  it('lists unrecorded morning density as "tell the manager", with no Record action', () => {
    givenData({
      useDensityTodaySummary: ok({
        missingCount: 1,
        missingProducts: [{ productId: 'p1', productName: 'Petrol', productCode: 'PET' }],
      }),
    });
    mount();
    const row = screen.getByText('Morning density not recorded').closest('div')!.parentElement!;
    expect(within(row).getByText(/Petrol · tell the manager/)).toBeTruthy();
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('lists cash drops with the total and "+N more" beyond three', () => {
    givenData({
      useShiftStatus: ok({
        activeShift: openShift({
          handovers: [
            {
              id: 'h1',
              userId: 'u1',
              duId: 'd1',
              cashDrops: '1000',
              createdAt: '2026-10-12T05:00:00.000Z',
              duName: 'DU 1',
              attendantName: 'Ravi',
            },
            {
              id: 'h2',
              userId: 'u2',
              duId: 'd2',
              cashDrops: '500',
              createdAt: '2026-10-12T06:00:00.000Z',
              duName: 'DU 2',
              attendantName: 'Asha',
            },
            {
              id: 'h3',
              userId: 'u3',
              duId: 'd3',
              cashDrops: '0',
              createdAt: '2026-10-12T06:30:00.000Z',
              duName: 'DU 3',
              attendantName: 'Kiran',
            },
            {
              id: 'h4',
              userId: 'u4',
              duId: 'd4',
              cashDrops: '250',
              createdAt: '2026-10-12T07:00:00.000Z',
              duName: 'DU 4',
              attendantName: 'Meena',
            },
            {
              id: 'h5',
              userId: 'u5',
              duId: 'd5',
              cashDrops: '100',
              createdAt: '2026-10-12T07:30:00.000Z',
              duName: 'DU 5',
              attendantName: 'Jose',
            },
          ],
        }),
      }),
    });
    mount();
    const section = screen.getByRole('region', { name: 'Cash drops this shift' });
    expect(within(section).getByText(/Ravi/)).toBeTruthy();
    expect(within(section).queryByText(/Kiran/)).toBeNull(); // zero drops are not listed
    expect(within(section).getByText('+1 more')).toBeTruthy();
    expect(within(section).getByText('₹1,850.00')).toBeTruthy();
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
