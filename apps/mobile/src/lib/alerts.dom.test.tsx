// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Station } from '@pump/shared';

const feed = vi.hoisted(() => ({ pastOpen: [] as { businessDate: string }[] }));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const q = (data: unknown) => ({ data, isLoading: false, isError: false });
  return {
    ...actual,
    useStationAlerts: () => [],
    useCustomers: () => q([]),
    useShiftSummaries: () => q([]),
    useBusinessDayStatus: () => q({ pastOpenBusinessDays: feed.pastOpen }),
  };
});

const { useMobileAlerts } = await import('./alerts.js');
const station = { id: 'st-1', name: 'Highway Fuels', settings: {} } as unknown as Station;

describe('useMobileAlerts: past open Business Days', () => {
  it('raises one alert per past open day, including older days behind a newer open one', () => {
    feed.pastOpen = [{ businessDate: '2026-10-08' }, { businessDate: '2026-10-06' }];
    const { result } = renderHook(() => useMobileAlerts(station));
    expect(result.current.filter((a) => a.category === 'day').map((a) => a.id)).toEqual([
      'day-2026-10-06',
      'day-2026-10-08',
    ]);
  });

  it('raises none when no past day is open', () => {
    feed.pastOpen = [];
    const { result } = renderHook(() => useMobileAlerts(station));
    expect(result.current).toEqual([]);
  });
});
