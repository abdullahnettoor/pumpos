import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import {
  GetBusinessDayStatus,
  type BusinessDayStatusItem,
  type BusinessDayStatusQuery,
  type BusinessDayStatusReader,
} from './get-business-day-status.js';

class Reader implements BusinessDayStatusReader {
  /** The window start the use-case asked for, captured for assertion. */
  recentFrom: string | null = null;
  constructor(readonly rows: BusinessDayStatusItem[]) {}
  async loadSlices({
    requestedBusinessDate: requestedDate,
    currentBusinessDate: currentDate,
    recentFromBusinessDate: recentFromDate,
  }: BusinessDayStatusQuery) {
    this.recentFrom = recentFromDate;
    const open = this.rows.filter((row) => row.status === 'OPEN');
    return {
      requested: this.rows.find((row) => row.businessDate === requestedDate) ?? null,
      open,
      pastOpen: open.filter((row) => row.businessDate < currentDate),
      // Handed back verbatim. Which rows belong in the window is the adapter's
      // job and is pinned against real Postgres; reimplementing that filter
      // here would only assert that this fake agrees with itself.
      recent: this.rows,
    };
  }
}

const ctx: ExecutionContext = {
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDayId: null,
  actorId: 'user-1',
  correlationId: null,
  clock: new FixedClock(new Date()),
  ids: new SequentialIdGenerator(),
};
const day = (
  id: string,
  businessDate: string,
  status: 'OPEN' | 'CLOSED' = 'OPEN',
): BusinessDayStatusItem => ({
  id,
  businessDate,
  status,
  openedAt: '2026-03-10T00:00:00Z',
  closedAt: status === 'CLOSED' ? '2026-03-10T15:00:00Z' : null,
  openShiftCount: 0,
  closedShiftCount: 2,
  lastActivityAt: '2026-03-10T12:00:00Z',
});

describe('GetBusinessDayStatus', () => {
  it('distinguishes a missing requested Business Day and returns every Past Open Business Day', async () => {
    const result = await new GetBusinessDayStatus(
      new Reader([day('one', '2026-03-13'), day('two', '2026-03-14'), day('future', '2026-03-16')]),
    ).execute(
      {
        stationId: 'station-1',
        requestedBusinessDate: '2026-03-15',
        currentBusinessDate: '2026-03-15',
      },
      ctx,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requestedState).toBe('NOT_CREATED');
      expect(result.data.requestedBusinessDay).toBeNull();
      expect(result.data.pastOpenBusinessDays.map((item) => item.id)).toEqual(['one', 'two']);
      expect(result.data.openBusinessDays.map((item) => item.id)).toEqual(['one', 'two', 'future']);
    }
  });

  it.each(['OPEN', 'CLOSED'] as const)('reports an existing %s Business Day', async (status) => {
    const requested = day('current', '2026-03-15', status);
    const result = await new GetBusinessDayStatus(new Reader([requested])).execute(
      {
        stationId: 'station-1',
        requestedBusinessDate: '2026-03-15',
        currentBusinessDate: '2026-03-15',
      },
      ctx,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requestedState).toBe(status);
      expect(result.data.requestedBusinessDay).toEqual(requested);
    }
  });
});

describe('the Recent Business Days window', () => {
  it('asks the reader for a window starting 13 days before the current business date', async () => {
    // 14 days inclusive of today: today minus 13.
    const reader = new Reader([]);
    await new GetBusinessDayStatus(reader).execute(
      {
        stationId: 'station-1',
        requestedBusinessDate: '2026-03-15',
        currentBusinessDate: '2026-03-15',
      },
      ctx,
    );
    expect(reader.recentFrom).toBe('2026-03-02');
  });

  it('crosses a month boundary rather than clamping the day number', async () => {
    const reader = new Reader([]);
    await new GetBusinessDayStatus(reader).execute(
      {
        stationId: 'station-1',
        requestedBusinessDate: '2026-03-05',
        currentBusinessDate: '2026-03-05',
      },
      ctx,
    );
    expect(reader.recentFrom).toBe('2026-02-20');
  });

  it('orders the list newest first', async () => {
    const result = await new GetBusinessDayStatus(
      new Reader([
        day('older', '2026-03-09', 'CLOSED'),
        day('newest', '2026-03-15', 'OPEN'),
        day('middle', '2026-03-12', 'CLOSED'),
      ]),
    ).execute(
      {
        stationId: 'station-1',
        requestedBusinessDate: '2026-03-15',
        currentBusinessDate: '2026-03-15',
      },
      ctx,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recentBusinessDays.map((item) => item.id)).toEqual([
        'newest',
        'middle',
        'older',
      ]);
    }
  });
});
