import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { GetBusinessDayStatus, type BusinessDayStatusItem, type BusinessDayStatusReader } from './get-business-day-status.js';

class Reader implements BusinessDayStatusReader {
  constructor(readonly rows: BusinessDayStatusItem[]) {}
  async findByDate(org: string, station: string, date: string) { return this.rows.find((row) => row.businessDate === date) ?? null; }
  async listPastOpen(org: string, station: string, date: string) { return this.rows.filter((row) => row.status === 'OPEN' && row.businessDate < date); }
}

const ctx: ExecutionContext = { organizationId: 'org-1', stationId: 'station-1', businessDayId: null, actorId: 'user-1', correlationId: null, clock: new FixedClock(new Date()), ids: new SequentialIdGenerator() };
const day = (id: string, businessDate: string, status: 'OPEN' | 'CLOSED' = 'OPEN'): BusinessDayStatusItem => ({ id, businessDate, status, openedAt: '2026-03-10T00:00:00Z', closedAt: status === 'CLOSED' ? '2026-03-10T15:00:00Z' : null, openShiftCount: 0, closedShiftCount: 2, lastActivityAt: '2026-03-10T12:00:00Z' });

describe('GetBusinessDayStatus', () => {
  it('distinguishes a missing requested Business Day and returns every Past Open Business Day', async () => {
    const result = await new GetBusinessDayStatus(new Reader([day('one', '2026-03-13'), day('two', '2026-03-14')])).execute(
      { stationId: 'station-1', requestedBusinessDate: '2026-03-15', currentBusinessDate: '2026-03-15' }, ctx,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requestedState).toBe('NOT_CREATED');
      expect(result.data.requestedBusinessDay).toBeNull();
      expect(result.data.pastOpenBusinessDays.map((item) => item.id)).toEqual(['one', 'two']);
    }
  });

  it.each(['OPEN', 'CLOSED'] as const)('reports an existing %s Business Day', async (status) => {
    const requested = day('current', '2026-03-15', status);
    const result = await new GetBusinessDayStatus(new Reader([requested])).execute(
      { stationId: 'station-1', requestedBusinessDate: '2026-03-15', currentBusinessDate: '2026-03-15' }, ctx,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requestedState).toBe(status);
      expect(result.data.requestedBusinessDay).toEqual(requested);
    }
  });
});
