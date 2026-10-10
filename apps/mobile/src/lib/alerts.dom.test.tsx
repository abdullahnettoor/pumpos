// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Station } from '@pump/shared';

const feed = vi.hoisted(() => ({
  pastOpen: [] as { businessDate: string }[],
  assignment: null as unknown,
}));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const q = (data: unknown) => ({ data, isLoading: false, isError: false });
  return {
    ...actual,
    useStationAlerts: () => [],
    useCustomers: () => q([]),
    useShiftSummaries: () => q([]),
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
