// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StatusBar } from './StatusBar.js';
import type { BusinessDayOption } from './TopBar.js';

afterEach(cleanup);

const baseProps = {
  syncStatus: 'online' as const,
  businessDate: '09 Jul 2026',
  businessDayStatus: 'open' as const,
};

describe('StatusBar sync segment', () => {
  it('shows a synced label when online', () => {
    render(<StatusBar {...baseProps} />);
    expect(screen.getByTestId('statusbar-sync').textContent).toContain('Synced');
  });

  it('surfaces the pending count while pending', () => {
    render(<StatusBar {...baseProps} syncStatus="pending" pendingSyncCount={4} />);
    expect(screen.getByTestId('statusbar-sync').textContent).toContain('Pending 4');
  });

  it('reports offline with queued writes', () => {
    render(<StatusBar {...baseProps} syncStatus="offline" pendingSyncCount={3} />);
    expect(screen.getByTestId('statusbar-sync').textContent).toContain('3 pending');
  });
});

describe('StatusBar business day', () => {
  it('renders the current business day and its status', () => {
    render(<StatusBar {...baseProps} />);
    const seg = screen.getByTestId('statusbar-business-day');
    expect(seg.textContent).toContain('09 Jul 2026');
    expect(seg.textContent).toContain('Open');
  });

  it('hides the business-day segment before the station is ready', () => {
    render(<StatusBar {...baseProps} showBusinessDay={false} />);
    expect(screen.queryByTestId('statusbar-business-day')).toBeNull();
  });

  it('exposes the business-day segment as a menu trigger', () => {
    const days: BusinessDayOption[] = [
      { date: '2026-07-07', label: 'Mon, 07 Jul', status: 'open', openShiftCount: 1, closedShiftCount: 2 },
    ];
    const onSelect = vi.fn();
    render(<StatusBar {...baseProps} businessDays={days} onSelectBusinessDay={onSelect} />);

    // The dropdown itself is a Radix portal that jsdom can't fully drive; the
    // contract at this seam is that the day is a menu trigger (aria-haspopup),
    // its content and selection wiring are covered by the shared Menu tests.
    const trigger = screen.getByTestId('statusbar-business-day');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  });
});

describe('StatusBar past-open warning', () => {
  it('appears only when past days are open', () => {
    const days: BusinessDayOption[] = [
      { date: '2026-07-07', label: 'Mon, 07 Jul' },
      { date: '2026-07-06', label: 'Sun, 06 Jul' },
    ];
    render(<StatusBar {...baseProps} businessDays={days} />);
    expect(screen.getByTestId('statusbar-past-open-warning').textContent).toContain('2 past days open');
  });

  it('is absent when no past days are open', () => {
    render(<StatusBar {...baseProps} />);
    expect(screen.queryByTestId('statusbar-past-open-warning')).toBeNull();
  });
});

describe('StatusBar open shift', () => {
  it('shows the open-shift indicator when a shift is open', () => {
    render(<StatusBar {...baseProps} openShiftLabel="Shift 2 · 6h 12m" />);
    expect(screen.getByTestId('statusbar-shift').textContent).toContain('Shift 2 · 6h 12m');
  });

  it('shows nothing shift-related when no shift is open', () => {
    render(<StatusBar {...baseProps} />);
    expect(screen.queryByTestId('statusbar-shift')).toBeNull();
  });
});

describe('StatusBar version / update', () => {
  it('shows the plain version when up to date (web and desktop)', () => {
    render(<StatusBar {...baseProps} appVersion="1.4.2" />);
    expect(screen.getByTestId('statusbar-version').textContent).toContain('v1.4.2');
    expect(screen.queryByTestId('statusbar-update')).toBeNull();
  });

  it('swaps to an update chip and fires the callback when an update is available', () => {
    const onUpdate = vi.fn();
    render(
      <StatusBar
        {...baseProps}
        appVersion="1.4.2"
        updateAvailableVersion="1.5.0"
        onUpdate={onUpdate}
      />,
    );
    const chip = screen.getByTestId('statusbar-update');
    expect(chip.textContent).toContain('Update to v1.5.0');
    expect(screen.queryByTestId('statusbar-version')).toBeNull();
    fireEvent.click(chip);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('renders no version segment when the version is unknown', () => {
    render(<StatusBar {...baseProps} />);
    expect(screen.queryByTestId('statusbar-version')).toBeNull();
    expect(screen.queryByTestId('statusbar-update')).toBeNull();
  });
});
