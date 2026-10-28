// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { act, cleanup, screen } from '@testing-library/react';
import {
  createTestQueryClient,
  renderWithProviders,
  muteExpectedConsoleErrors,
} from '../../test/renderWithProviders.js';
import {
  __resetNavIntentForTests,
  getNavIntentState,
  publishNavIntent,
} from '../../nav-intent/store.js';

/**
 * Dashboard "Review in Shifts" (open-days notice) publishes `{ openPastDays }`.
 * Shifts must land on the Business Day tab, ask it to filter to the still-open
 * past days, and keep that tab once the request is consumed.
 */
const tabProps = vi.fn();
vi.mock('./BusinessDayTab.js', () => ({
  BusinessDayTab: (props: Record<string, unknown>) => {
    tabProps(props);
    return <div data-testid="business-day-tab" />;
  },
}));

const { ShiftsManagement } = await import('./ShiftsManagement.js');
const { queryKeys } = await import('../../query/hooks.js');

const STATION_ID = 'st-1';
const STATION = { id: 'st-1', name: 'Test RO', settings: {} } as never;

const mount = () => {
  const client = createTestQueryClient();
  client.setQueryData(queryKeys.shiftStatus(STATION_ID, false), {
    activeShift: null,
    lastShift: null,
    lastShiftSummary: null,
    templates: [],
    nozzles: [],
    staff: [],
    dispensers: [],
    terminals: [],
  });
  return renderWithProviders(
    <ShiftsManagement
      selectedStation={STATION}
      userRole="Owner"
      userName="Owner"
      onNavigate={vi.fn()}
    />,
    { queryClient: client },
  );
};

let restoreConsole: () => void;
beforeEach(() => {
  __resetNavIntentForTests();
  tabProps.mockClear();
  restoreConsole = muteExpectedConsoleErrors([/not wrapped in act/, /Warning:/]);
});
afterEach(() => {
  cleanup();
  restoreConsole();
});

describe('ShiftsManagement openPastDays intent', () => {
  it('opens the Business Day tab asking for the open past days', () => {
    publishNavIntent({ openPastDays: true });
    mount();
    expect(screen.getByTestId('business-day-tab')).toBeTruthy();
    expect(tabProps).toHaveBeenCalledWith(expect.objectContaining({ openPastDaysRequested: true }));
  });

  it('stays on the Business Day tab once the request is consumed', () => {
    publishNavIntent({ openPastDays: true });
    mount();
    const { onOpenPastDaysConsumed } = tabProps.mock.calls.at(-1)![0] as {
      onOpenPastDaysConsumed: () => void;
    };
    act(() => onOpenPastDaysConsumed());
    expect(getNavIntentState().intent).toBeNull();
    expect(screen.getByTestId('business-day-tab')).toBeTruthy();
  });

  it('does not open the Business Day tab without the intent', () => {
    mount();
    expect(screen.queryByTestId('business-day-tab')).toBeNull();
  });
});
