// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Station } from '@pump/shared';

const hooks = vi.hoisted(() => ({
  useShiftStatus: vi.fn(),
  useShiftTemplates: vi.fn(),
  useShiftSummaries: vi.fn(),
  useDayActivity: vi.fn(),
}));
vi.mock('../../../query/hooks.js', () => hooks);
vi.mock('../../../query/dashboardActivity.js', () => ({ useDayActivity: hooks.useDayActivity }));

import { TimelineCard } from './TimelineCard.js';
import { DashboardProvider } from '../frame/DashboardContext.js';

const NOW = new Date('2026-10-12T09:30:00Z'); // 15:00 IST
const STATION = { id: 'st-1' } as unknown as Station;
const ok = (data: unknown) => ({ data, isPending: false, isError: false, refetch: vi.fn() });
const TEMPLATES = [
  { id: 't1', name: 'Morning', startTime: '06:00', endTime: '14:00', isActive: true },
  { id: 't2', name: 'Evening', startTime: '14:00', endTime: '22:00', isActive: true },
];
const shift = (over: object) => ({
  id: 's1',
  shiftTemplateId: 't1',
  templateName: 'Morning',
  shiftSequence: 1,
  businessDate: '2026-10-12',
  openedAt: '2026-10-12T00:30:00Z',
  closedAt: null,
  ...over,
});
const ev = (i: number, type: string, at: string) => ({
  groupId: `g${i}`,
  primary: {
    eventType: type,
    tone: 'info',
    aggregateId: `a${i}`,
    title: `${type} ${i}`,
    occurredAt: at,
  },
});

const onNavigate = vi.fn();
const mount = (role: any = 'Owner') =>
  render(
    <DashboardProvider
      value={{
        station: STATION,
        role,
        userName: 'A',
        timeZone: 'Asia/Kolkata',
        dayStartsAt: '06:00',
        businessDate: '2026-10-12',
        onNavigate,
      }}
    >
      <TimelineCard />
    </DashboardProvider>,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  hooks.useShiftTemplates.mockReturnValue(ok(TEMPLATES));
  hooks.useShiftSummaries.mockReturnValue(ok([]));
  hooks.useDayActivity.mockReturnValue(ok({ items: [] }));
  hooks.useShiftStatus.mockReturnValue(ok({ activeShift: shift({}), recentClosedShifts: [] }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TimelineCard', () => {
  it('shows a hatched running bar while a shift is open', () => {
    mount();
    expect(screen.getByTestId('timeline-bar-running')).toBeTruthy();
    expect(screen.getByTestId('timeline-now')).toBeTruthy();
  });

  it('is hidden before the first shift', () => {
    hooks.useShiftStatus.mockReturnValue(ok({ activeShift: null, recentClosedShifts: [] }));
    const { container } = mount();
    expect(container.firstChild).toBeNull();
  });

  it('is hidden once the day is complete', () => {
    hooks.useShiftStatus.mockReturnValue(
      ok({
        activeShift: null,
        recentClosedShifts: [
          shift({ closedAt: '2026-10-12T08:00:00Z' }),
          shift({ id: 's2', shiftTemplateId: 't2', closedAt: '2026-10-12T09:00:00Z' }),
        ],
      }),
    );
    const { container } = mount();
    expect(container.firstChild).toBeNull();
  });

  it('shows a ghost bar between shifts', () => {
    hooks.useShiftStatus.mockReturnValue(
      ok({ activeShift: null, recentClosedShifts: [shift({ closedAt: '2026-10-12T08:30:00Z' })] }),
    );
    mount();
    expect(screen.getByTestId('timeline-bar-closed')).toBeTruthy();
    expect(screen.getByTestId('timeline-bar-ghost')).toBeTruthy();
  });

  it('merges five cash drops into one pin with a count and opens the event', () => {
    hooks.useDayActivity.mockReturnValue(
      ok({
        items: [0, 1, 2, 3, 4].map((i) =>
          ev(i, 'HANDOVER_RECORDED', `2026-10-12T0${3 + 0}:${10 + i * 5}:00Z`),
        ),
      }),
    );
    mount();
    const pins = screen.getAllByTestId('timeline-pin');
    expect(pins).toHaveLength(1);
    expect(pins[0].getAttribute('data-count')).toBe('5');
    fireEvent.focus(pins[0]);
    fireEvent.click(screen.getByText('HANDOVER_RECORDED 2'));
    expect(onNavigate).toHaveBeenCalledWith('/shifts', undefined);
  });

  it('queries the activity feed for the station and business date', () => {
    mount();
    expect(hooks.useDayActivity).toHaveBeenCalledWith('st-1', '2026-10-12', { enabled: true });
  });

  it('collapses to one line and remembers it', () => {
    hooks.useDayActivity.mockReturnValue(
      ok({ items: [ev(1, 'SHIFT_OPENED', '2026-10-12T00:30:00Z')] }),
    );
    const first = mount();
    fireEvent.click(screen.getByRole('button', { name: /hide/i }));
    expect(screen.getByTestId('timeline-summary').textContent).toContain('Shift 1 live');
    expect(screen.getByTestId('timeline-summary').textContent).toContain('1 event');
    first.unmount();
    mount();
    expect(screen.getByTestId('timeline-summary')).toBeTruthy();
    expect(screen.getByRole('button', { name: /show timeline/i })).toBeTruthy();
  });

  it('shows a retry when the activity feed fails', () => {
    const refetch = vi.fn();
    hooks.useDayActivity.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders nothing and does not enable queries for Attendant-like hidden roles', () => {
    const { container } = mount('Attendant');
    expect(container.firstChild).toBeNull();
    expect(hooks.useDayActivity).toHaveBeenCalledWith('st-1', '2026-10-12', { enabled: false });
  });
});
