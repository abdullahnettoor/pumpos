// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Station } from '@pump/shared';

const hooks = vi.hoisted(() => ({
  useDashboardSummary: vi.fn(),
  useShiftTemplates: vi.fn(),
  useShiftStatus: vi.fn(),
  useDayActivity: vi.fn(),
}));
vi.mock('../../../query/hooks.js', () => hooks);

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
  entryDate: '2026-10-12',
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
const mount = (role: any = 'Owner', dayStartsAt = '06:00', businessDate = '2026-10-12') =>
  render(
    <DashboardProvider
      value={{
        station: STATION,
        role,
        userName: 'A',
        now: new Date(Date.now()),
        timeZone: 'Asia/Kolkata',
        dayStartsAt,
        businessDate,
        entryDate: '2026-10-12',
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
  hooks.useShiftStatus.mockReturnValue(ok({ activeShift: null }));
  hooks.useDayActivity.mockReturnValue(ok({ items: [] }));
  hooks.useDashboardSummary.mockReturnValue(ok({ today: { shifts: [shift({})] } }));
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
    hooks.useDashboardSummary.mockReturnValue(ok({ today: { shifts: [] } }));
    const { container } = mount();
    expect(container.firstChild).toBeNull();
  });

  it('is hidden once the day is complete', () => {
    hooks.useDashboardSummary.mockReturnValue(
      ok({
        today: {
          shifts: [
            shift({ closedAt: '2026-10-12T08:00:00Z' }),
            shift({ id: 's2', shiftTemplateId: 't2', closedAt: '2026-10-12T09:00:00Z' }),
          ],
        },
      }),
    );
    const { container } = mount();
    expect(container.firstChild).toBeNull();
  });

  it('shows a ghost bar between shifts', () => {
    hooks.useDashboardSummary.mockReturnValue(
      ok({ today: { shifts: [shift({ closedAt: '2026-10-12T08:30:00Z' })] } }),
    );
    mount();
    expect(screen.getByTestId('timeline-bar-closed')).toBeTruthy();
    expect(screen.getByTestId('timeline-bar-ghost')).toBeTruthy();
  });

  it('labels a closed bar with the server total and a dimmed variance', () => {
    hooks.useDashboardSummary.mockReturnValue(
      ok({
        today: {
          shifts: [
            shift({
              closedAt: '2026-10-12T08:30:00Z',
              totalFuelSalesValue: 216120,
              cashVariance: -340,
            }),
          ],
        },
      }),
    );
    mount();
    const bar = screen.getByTestId('timeline-bar-closed');
    expect(bar.textContent).toBe('Shift 1 · ₹2,16,120· −₹340Opened 6 am');
    expect(bar.querySelector('.opacity-75')?.textContent).toContain('−₹340');
  });

  it('shows the heading, axis labels and a now line', () => {
    mount();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText(/6 am → 6 am/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /collapse/i })).toBeTruthy();
    // One label per hour, Day Start to Day Start (the one under the now pill is hidden).
    const labels = screen.getAllByTestId('timeline-axis-label').map((n) => n.textContent);
    expect(labels[0]).toBe('6a');
    expect(labels.at(-1)).toBe('6a');
    expect(labels).toContain('2p');
    expect(labels.length).toBeGreaterThanOrEqual(23);
    expect(screen.getByTestId('timeline-now').className).toContain('bg-brand-danger');
    expect(screen.getByTestId('timeline-now-label').textContent).toMatch(/\d+(:\d{2})? (am|pm)/);
  });

  it('draws the bar on the template window and marks the real opening with a chip', () => {
    hooks.useDashboardSummary.mockReturnValue(
      ok({ today: { shifts: [shift({ openedAt: '2026-10-12T01:10:00Z' })] } }), // 6:40 am IST
    );
    mount();
    // Shift 1 is scheduled 6:00 am–2:00 pm on a 6:00 am Day Start: 0% → 33.3%.
    const bar = screen.getByTestId('timeline-bar-running');
    expect(parseFloat(bar.style.left)).toBe(0);
    expect(parseFloat(bar.style.width)).toBeCloseTo(33.33, 1);
    expect(bar.title).toContain('Opened 6:40 am');
    expect(screen.queryByTestId('timeline-window-label')).toBeNull();
    const chip = screen.getByTestId('timeline-opening-chip');
    expect(chip.textContent).toBe('Opened 6:40 am · 40m late');
    expect(bar.contains(chip)).toBe(true); // inside the bar, no row of its own
  });

  it('labels a running bar live, and past end with a warning border', () => {
    vi.setSystemTime(new Date('2026-10-12T06:30:00Z')); // 12:00 IST, before 2 pm end
    const first = mount();
    const live = screen.getByTestId('timeline-bar-running');
    expect(live.textContent).toBe('Shift 1 · liveOpened 6 am');
    expect(live.className).not.toContain('border-brand-warning');
    first.unmount();
    vi.setSystemTime(NOW); // 3 pm, past the 2 pm scheduled end
    hooks.useShiftStatus.mockReturnValue(
      ok({
        activeShift: {
          id: 's1',
          openedAt: '2026-10-12T00:30:00Z',
          scheduledEndTime: '14:00',
          staffAssignments: [{ id: 'a1', userId: 'u1', duId: 'd1' }],
          handovers: [],
        },
      }),
    );
    mount();
    const bar = screen.getByTestId('timeline-bar-running');
    expect(bar.textContent).toMatch(/^Shift 1 · past end, 1 handover dueOpened /);
    expect(bar.className).toContain('border-warning-fg');
    expect(bar.className).not.toContain('border-brand');
  });

  describe.each(['05:30', '00:00'])('night template with Day Start %s', (dayStart) => {
    const NIGHT = [
      { id: 'n1', name: 'Night', startTime: '22:00', endTime: '06:00', isActive: true },
    ];
    // Opened 22:00 IST on 11 Oct; business date: Day Start 05:30 -> 10-11, 00:00 -> 10-11.
    const run = (nowIso: string) => {
      vi.setSystemTime(new Date(nowIso));
      hooks.useShiftTemplates.mockReturnValue(ok(NIGHT));
      hooks.useDashboardSummary.mockReturnValue(
        ok({
          today: {
            shifts: [
              shift({
                shiftTemplateId: 'n1',
                openedAt: '2026-10-11T16:30:00Z',
                businessDate: '2026-10-11',
              }),
            ],
          },
        }),
      );
      hooks.useShiftStatus.mockReturnValue(
        ok({
          activeShift: {
            id: 's1',
            openedAt: '2026-10-11T16:30:00Z',
            scheduledEndTime: '06:00',
            staffAssignments: [{ id: 'a1', userId: 'u1', duId: 'd1' }],
            handovers: [],
          },
        }),
      );
      mount('Owner', dayStart, '2026-10-11');
    };
    it('is live, not late, at 22:30', () => {
      run('2026-10-11T17:00:00Z'); // 22:30 IST
      const bar = screen.getByTestId('timeline-bar-running');
      expect(bar.textContent).toMatch(/^Shift 1 · live/);
      expect(bar.className).not.toContain('border-warning-fg');
    });
    it('is late at 06:30', () => {
      run('2026-10-12T01:00:00Z'); // 06:30 IST next morning
      const bar = screen.getByTestId('timeline-bar-running');
      expect(bar.textContent).toMatch(/^Shift 1 · past end, 1 handover due/);
      expect(bar.className).toContain('border-warning-fg');
    });
  });

  it('labels the ghost bar with its scheduled start', () => {
    hooks.useDashboardSummary.mockReturnValue(
      ok({ today: { shifts: [shift({ closedAt: '2026-10-12T08:30:00Z' })] } }),
    );
    mount();
    expect(screen.getByTestId('timeline-bar-ghost').textContent).toBe(
      'Shift 2 · scheduled 2:00 pm, not opened yet',
    );
  });

  it('shows a placeholder while loading, and nothing once known hidden', () => {
    hooks.useDashboardSummary.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });
    const { container } = mount();
    const ph = container.querySelector('[aria-busy="true"]') as HTMLElement;
    expect(ph.style.height).toBe('80px');
  });

  it('does not show cash-drop events as pins', () => {
    hooks.useDayActivity.mockReturnValue(
      ok({ items: [ev(1, 'CASH_DROP_RECORDED', '2026-10-12T03:10:00Z')] }),
    );
    mount();
    expect(screen.queryAllByTestId('timeline-pin')).toHaveLength(0);
  });

  it('renders the pin list in a portal outside the card and clamps it to the viewport', () => {
    vi.stubGlobal('innerWidth', 1000);
    hooks.useDayActivity.mockReturnValue(
      ok({
        items: [0, 1].map((i) => ev(i, 'SHIFT_OPENED', `2026-10-12T00:${30 + i}:00Z`)),
      }),
    );
    const { container } = mount();
    const pin = screen.getAllByTestId('timeline-pin')[0];
    pin.parentElement!.getBoundingClientRect = () =>
      ({ left: -50, width: 20, bottom: 30, top: 10, right: -30 }) as DOMRect;
    fireEvent.click(pin);
    const list = screen.getByTestId('timeline-pin-list');
    expect(container.contains(list)).toBe(false);
    expect(list.parentElement).toBe(document.body);
    expect(list.style.left).toBe('8px');
  });

  it('draws a pin as a chip with an inline count, not a corner badge', () => {
    hooks.useDayActivity.mockReturnValue(
      ok({
        items: [0, 1].map((i) => ev(i, 'SHIFT_OPENED', `2026-10-12T00:${30 + i}:00Z`)),
      }),
    );
    mount();
    const pin = screen.getAllByTestId('timeline-pin')[0];
    expect(pin.className).toContain('border-[1.5px]');
    expect(pin.className).toContain('h-5');
    expect(pin.textContent).toBe('2');
    expect(pin.querySelector('.absolute')).toBeNull();
  });

  it('merges five handovers into one pin with a count and opens the event', () => {
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
    fireEvent.click(pins[0]);
    fireEvent.mouseLeave(pins[0].parentElement!);
    // Each event shows its own station-time clock (03:10Z = 8:40 am IST).
    expect(screen.getAllByTestId('timeline-pin-time').map((n) => n.textContent)).toEqual([
      '8:40 am',
      '8:45 am',
      '8:50 am',
      '8:55 am',
      '9 am',
    ]);
    fireEvent.click(screen.getByText('HANDOVER_RECORDED 2'));
    expect(onNavigate).toHaveBeenCalledWith('/shifts', undefined);
  });

  it('keeps the list open after leaving the pin and closes on outside press or Escape', () => {
    hooks.useDayActivity.mockReturnValue(
      ok({ items: [0, 1].map((i) => ev(i, 'SHIFT_OPENED', `2026-10-12T00:${30 + i}:00Z`)) }),
    );
    mount();
    const pin = screen.getAllByTestId('timeline-pin')[0];
    fireEvent.click(pin);
    fireEvent.mouseLeave(pin.parentElement!);
    fireEvent.blur(pin);
    expect(screen.getByTestId('timeline-pin-list')).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId('timeline-pin-list'));
    expect(screen.getByTestId('timeline-pin-list')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('timeline-pin-list')).toBeNull();
    fireEvent.click(pin);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('timeline-pin-list')).toBeNull();
  });

  it('queries the activity feed for the station and business date', () => {
    mount();
    expect(hooks.useDayActivity).toHaveBeenCalledWith(
      'st-1',
      '2026-10-12',
      expect.objectContaining({ enabled: true }),
    );
  });

  it('collapses to one line and remembers it', () => {
    hooks.useDayActivity.mockReturnValue(
      ok({ items: [ev(1, 'SHIFT_OPENED', '2026-10-12T00:30:00Z')] }),
    );
    const first = mount();
    fireEvent.click(screen.getByRole('button', { name: /collapse/i }));
    expect(screen.getByTestId('timeline-summary').textContent).toContain(
      'Shift 1 past scheduled end',
    );
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
    expect(hooks.useDayActivity).toHaveBeenCalledWith(
      'st-1',
      '2026-10-12',
      expect.objectContaining({ enabled: false }),
    );
  });
});
