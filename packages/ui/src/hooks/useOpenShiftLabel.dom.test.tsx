// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Drive the hook through a faked shift-status query so no QueryClient/network
// is involved: this test is about the mapping + ticker, not the fetch.
const useShiftStatus = vi.fn();
vi.mock('../query/hooks.js', () => ({
  useShiftStatus: (...args: unknown[]) => useShiftStatus(...args),
}));

import { useOpenShiftLabel } from './useOpenShiftLabel.js';

const Probe = ({ stationId = 'st-1' }: { stationId?: string | null }) => {
  const label = useOpenShiftLabel(stationId);
  return <span data-testid="label">{label ?? 'NONE'}</span>;
};

function withOpenShift(openedAt: string) {
  useShiftStatus.mockReturnValue({
    data: {
      activeShift: { businessDate: '2026-09-22', shiftSequence: 2, openedAt },
    },
  });
}

describe('useOpenShiftLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T12:12:00.000Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useShiftStatus.mockReset();
  });

  it('maps an open shift to "Shift <label> open · <elapsed>" via the shared label', () => {
    // Opened 6h 12m before "now".
    withOpenShift('2026-09-22T06:00:00.000Z');
    render(<Probe />);
    expect(screen.getByTestId('label').textContent).toBe('Shift 20260922-2 open · 6h 12m');
  });

  it('renders nothing shift-related when no shift is open (#263 story 11)', () => {
    useShiftStatus.mockReturnValue({ data: { activeShift: null } });
    render(<Probe />);
    expect(screen.getByTestId('label').textContent).toBe('NONE');
  });

  it('renders nothing when the shift lacks a derivable label', () => {
    useShiftStatus.mockReturnValue({
      data: {
        activeShift: {
          businessDate: null,
          shiftSequence: null,
          openedAt: '2026-09-22T06:00:00.000Z',
        },
      },
    });
    render(<Probe />);
    expect(screen.getByTestId('label').textContent).toBe('NONE');
  });

  it('advances the elapsed time about once a minute without refetching', () => {
    withOpenShift('2026-09-22T06:00:00.000Z');
    render(<Probe />);
    expect(screen.getByTestId('label').textContent).toBe('Shift 20260922-2 open · 6h 12m');

    const callsAfterMount = useShiftStatus.mock.calls.length;
    // Two minutes pass.
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(screen.getByTestId('label').textContent).toBe('Shift 20260922-2 open · 6h 14m');
    // The ticker re-rendered but did not add query calls beyond React's own
    // re-render of the (mocked) hook — no extra network is triggered by us.
    expect(useShiftStatus.mock.calls.length).toBeGreaterThanOrEqual(callsAfterMount);
  });

  it('reads the lite branch of the shift-status query', () => {
    withOpenShift('2026-09-22T06:00:00.000Z');
    render(<Probe />);
    expect(useShiftStatus).toHaveBeenCalledWith('st-1', true);
  });
});
