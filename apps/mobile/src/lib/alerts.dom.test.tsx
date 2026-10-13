// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Station } from '@pump/shared';

const feed = vi.hoisted(() => ({
  pastOpen: [] as { businessDate: string }[],
  assignment: null as unknown,
  decantations: [] as unknown[],
  densityToday: null as unknown,
}));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const q = (data: unknown) => ({ data, isLoading: false, isError: false });
  return {
    ...actual,
    useStationAlerts: () => [],
    useCustomers: () => q([]),
    useProducts: () => q([]),
    useShiftSummaries: () => q([]),
    useDecantations: () => q(feed.decantations),
    useDensityTodaySummary: () => q(feed.densityToday),
    useMyAssignment: () => q(feed.assignment),
    useBusinessDayStatus: () => q({ pastOpenBusinessDays: feed.pastOpen }),
  };
});

const { useMobileAlerts } = await import('./alerts.js');
const station = { id: 'st-1', name: 'Highway Fuels', settings: {} } as unknown as Station;
describe('useMobileAlerts: past open Business Days', () => {
  it('raises one alert per past open day, newest first, including older days behind a newer open one', () => {
    feed.pastOpen = [{ businessDate: '2026-10-08' }, { businessDate: '2026-10-06' }];
    const { result } = renderHook(() => useMobileAlerts(station));
    expect(result.current.filter((a) => a.category === 'day').map((a) => a.id)).toEqual([
      'day-2026-10-08',
      'day-2026-10-06',
    ]);
  });

  it('raises none when no past day is open', () => {
    feed.pastOpen = [];
    const { result } = renderHook(() => useMobileAlerts(station));
    expect(result.current).toEqual([]);
  });
});

describe('useMobileAlerts: own handover', () => {
  const assignment = (handover?: unknown) => ({
    shift: { id: 's2', templateName: 'Shift 2' },
    dispenserUnits: [{ duId: 'du-2', duName: 'DU2', nozzles: [], terminals: [], handover }],
  });

  it('counts an unsaved handover, and drops it once the handover is saved', () => {
    feed.pastOpen = [];
    feed.assignment = assignment();
    const { result, rerender } = renderHook(() => useMobileAlerts(station));
    expect(result.current.map((a) => a.id)).toEqual(['handover-own']);
    expect(result.current[0].action).toEqual({ kind: 'handover' });

    feed.assignment = assignment({
      cashHandedOver: 100,
      expectedCash: 100,
      variance: 0,
      recordedAt: '2026-10-09T12:00:00Z',
    });
    rerender();
    expect(result.current).toEqual([]);
  });

  it('raises none for a user with no Dispenser Unit', () => {
    feed.pastOpen = [];
    feed.assignment = null;
    const { result } = renderHook(() => useMobileAlerts(station));
    expect(result.current).toEqual([]);
  });
});

describe('useMobileAlerts: Decantation and density', () => {
  it('loads and derives alerts for back-office roles, density for Staff too, nothing for Attendants', () => {
    feed.pastOpen = [];
    feed.assignment = null;
    feed.decantations = [
      {
        id: 'dec-1',
        documentNumber: 'DEC-1',
        tankerNumber: 'TN-42',
        status: 'PENDING_MEASUREMENT',
        flags: [],
        unlinkedProductIds: [],
        lines: [{ id: 'line-1', productId: 'p1', status: 'PENDING_MEASUREMENT' }],
      },
    ];
    feed.densityToday = {
      missingCount: 1,
      totalProducts: 2,
      missingProducts: [{ productId: 'p1', productName: 'Petrol', productCode: 'MS' }],
    };
    for (const role of ['Owner', 'Manager', 'Accountant'] as const) {
      const { result, unmount } = renderHook(() => useMobileAlerts(station, role));
      expect(result.current.map((alert) => alert.category)).toEqual(['decantation', 'density']);
      unmount();
    }
    const staff = renderHook(() => useMobileAlerts(station, 'Staff'));
    expect(staff.result.current.map((alert) => alert.category)).toEqual(['density']);
    staff.unmount();
    const attendant = renderHook(() => useMobileAlerts(station, 'Attendant'));
    expect(attendant.result.current).toEqual([]);
    attendant.unmount();
  });
});
