import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryEventStore, InProcessEventDispatcher, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import type { StockVariance, StockVarianceRepository } from '../../inventory/index.js';
import { ReopenShift } from './reopen-shift.js';
import type { Shift, ShiftRepository, ShiftSummaryWriter } from './ports.js';

class ShiftRepo implements ShiftRepository {
  constructor(readonly row: Shift) {}
  async findById(id: string) { return id === this.row.id ? this.row : null; }
  async save() {}
  async findOpenByStation() { return null; }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}

class SummaryWriter implements ShiftSummaryWriter {
  async save() {}
  async deleteForShift() {}
}

class VarianceRepo implements StockVarianceRepository {
  constructor(private readonly hasDip: boolean) {}
  async save(_variance: StockVariance) {}
  async existsForShift() { return this.hasDip; }
}

const shift: Shift = {
  id: 'shift-1', organizationId: 'org-1', stationId: 'station-1', businessDayId: 'day-1', shiftTemplateId: 'template-1',
  status: 'CLOSED', openedBy: 'user-1', openedAt: '', closedBy: 'user-1', closedAt: '', lockedAt: null,
  openingCash: '0', closingCash: '0', createdAt: '', updatedAt: '',
};

const context: ExecutionContext = {
  organizationId: 'org-1', stationId: 'station-1', businessDayId: 'day-1', actorId: 'user-1', correlationId: null,
  clock: new FixedClock(new Date('2026-09-12T10:00:00Z')), ids: new SequentialIdGenerator('id'),
};

describe('ReopenShift', () => {
  it('rejects reopening a Shift with an attributed Tank Dip', async () => {
    const result = await new ReopenShift({
      shifts: new ShiftRepo(shift),
      summaries: new SummaryWriter(),
      stockVariances: new VarianceRepo(true),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: shift.id }, context);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
  });
});
