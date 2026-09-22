// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';

/**
 * The Closed & Locked Shifts history is what an operator checks a past shift
 * against. Every column here is read-path only — it reads fields the list
 * endpoint returns — and the failure mode is quiet: a column that reads a name
 * the API never sends renders its fallback for every row and looks like real
 * data ("Custom", "Closed", "Unknown", "₹0"). These pin the field names (#224).
 */
const summaries = vi.fn<[], unknown[]>(() => []);

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useShiftSummaries: () => ({ data: summaries(), isPending: false, isLoading: false }),
}));

const { ShiftHistoryTab } = await import('./ShiftHistoryTab.js');

const STATION = { id: 'station-1', name: 'Test RO', settings: {} } as never;

/** One row in the shape `GET /shift-summaries` actually returns. */
const apiRow = (over: Record<string, unknown> = {}) => ({
  shiftId: 'shift-1',
  status: 'CLOSED',
  openedAt: '2026-03-01T00:30:00.000Z',
  closedAt: '2026-03-01T08:30:00.000Z',
  generatedAt: '2026-03-01T08:30:00.000Z',
  businessDate: '2026-03-01',
  templateName: 'Morning',
  snapshotData: {
    closedByName: 'Priya Nair',
    expectedCash: 18200,
    closingCash: 18500,
    cashVariance: 300,
  },
  ...over,
});

/** Scoped to the rows: the page heading also contains "Closed" and "Locked". */
const body = () => within(document.querySelector('tbody') as HTMLElement);

const render = (rows: unknown[]) => {
  summaries.mockReturnValue(rows);
  renderWithProviders(<ShiftHistoryTab selectedStation={STATION} userRole="Owner" />);
};

describe('ShiftHistoryTab', () => {
  afterEach(() => {
    cleanup();
    summaries.mockReset();
  });

  it('names the shift YYYYMMDD-N rather than a uuid fragment (#228)', () => {
    render([apiRow({ shiftSequence: 2 })]);
    expect(body().getByText('20260301-2')).toBeDefined();
    expect(body().queryByText(/shift-1/)).toBeNull();
  });

  it('falls back to a uuid fragment for rows with no sequence', () => {
    render([apiRow({ shiftId: '8f6c3d04-aaaa-bbbb-cccc-dddddddddddd', shiftSequence: null })]);
    expect(body().getByText('8f6c3d04\u2026')).toBeDefined();
  });

  it('shows the template the shift was opened from', () => {
    render([apiRow()]);
    expect(body().getByText('Morning')).toBeDefined();
    expect(body().queryByText('Custom')).toBeNull();
  });

  it('prefers the joined template name over the snapshot copy', () => {
    render([apiRow({ snapshotData: { ...apiRow().snapshotData, templateName: 'Stale' } })]);
    expect(screen.getByText('Morning')).toBeDefined();
    expect(screen.queryByText('Stale')).toBeNull();
  });

  it('falls back gracefully for test-era rows with no template at all', () => {
    render([apiRow({ templateName: null, snapshotData: {} })]);
    expect(body().getByText('Custom')).toBeDefined();
  });

  it('badges a locked shift as Locked, not merely Closed', () => {
    render([apiRow({ status: 'LOCKED' })]);
    expect(body().getByText(/Locked/i)).toBeDefined();
    expect(body().queryByText(/Closed/i)).toBeNull();
  });

  it('badges a closed shift as Closed', () => {
    render([apiRow()]);
    expect(body().getByText(/Closed/i)).toBeDefined();
    expect(body().queryByText(/Locked/i)).toBeNull();
  });

  it('shows who reconciled the shift and the expected drawer', () => {
    render([apiRow()]);
    expect(screen.getByText('Priya Nair')).toBeDefined();
    expect(screen.getByText(/18,200/)).toBeDefined();
  });

  describe('which column leads (#226)', () => {
    const headers = () =>
      Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent?.trim());

    it('leads with Business Day, not the closure timestamp', () => {
      // A shift closing 05:11 on the 17th belongs to the 16th. Leading with
      // the closure time invites reading that row as the 17th's.
      render([apiRow()]);
      expect(headers()[0]).toMatch(/Business Day/i);
    });

    it('still shows the closure time, demoted rather than dropped', () => {
      render([apiRow()]);
      const closureIndex = headers().findIndex((h) => /Closed/i.test(h ?? ''));
      expect(closureIndex).toBeGreaterThan(0);
    });

    it('renders the business date in the leading cell', () => {
      render([apiRow()]);
      const first = body().getAllByRole('row')[0].querySelectorAll('td')[0];
      expect(first.textContent).toMatch(/Mar/i);
    });

    it('marks a row with no business date instead of leaving the lead cell blank', () => {
      render([apiRow({ businessDate: null })]);
      const first = body().getAllByRole('row')[0].querySelectorAll('td')[0];
      expect(first.textContent?.trim()).toBe('—');
    });
  });
});
