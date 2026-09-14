import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryEventStore, InProcessEventDispatcher, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import type { BusinessDay, BusinessDayWriteRepository } from '../business-days/index.js';
import { LockShift } from './lock-shift.js';
import type { Shift, ShiftRepository } from './ports.js';

const shift: Shift = {
  id: 'shift-1', organizationId: 'org-1', stationId: 'station-1', businessDayId: 'day-1', shiftTemplateId: 'template-1',
  status: 'CLOSED', openedBy: 'user-1', openedAt: '', closedBy: 'user-1', closedAt: '2026-09-12T09:00:00Z', lockedAt: null,
  openingCash: '0', closingCash: '100', createdAt: '', updatedAt: '',
};

class ShiftRepo implements ShiftRepository {
  saved: Shift | null = null;
  async findById() { return shift; }
  async findByIdWithoutLock() { return shift; }
  async save(row: Shift) { this.saved = row; }
  async findOpenByStation() { return null; }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}

class DayRepo implements BusinessDayWriteRepository {
  constructor(private readonly status: BusinessDay['status']) {}
  private row(): BusinessDay {
    return { id: 'day-1', organizationId: 'org-1', stationId: 'station-1', businessDate: '2026-09-12', status: this.status, openedBy: 'user-1', openedAt: '', closedBy: this.status === 'CLOSED' ? 'user-1' : null, closedAt: this.status === 'CLOSED' ? '2026-09-12T10:00:00Z' : null, createdAt: '', updatedAt: '' };
  }
  async findById() { return this.row(); }
  async save() {}
  async findOpenByStation() { return this.status === 'OPEN' ? this.row() : null; }
  async findByStationAndDate() { return this.row(); }
  async lockStation() {}
  async lockById() {}
  async lockByStationAndDate() {}
}

const context: ExecutionContext = {
  organizationId: 'org-1', stationId: 'station-1', businessDayId: 'day-1', actorId: 'user-1', correlationId: null,
  clock: new FixedClock(new Date('2026-09-12T11:00:00Z')), ids: new SequentialIdGenerator('id'),
};

describe('LockShift', () => {
  it('cannot lock a shift while its Business Day is open', async () => {
    const shifts = new ShiftRepo();
    const result = await new LockShift({ shifts, businessDays: new DayRepo('OPEN'), events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }) })
      .execute({ shiftId: shift.id }, context);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
    expect(shifts.saved).toBeNull();
  });

  it('locks a closed shift after its Business Day closes', async () => {
    const shifts = new ShiftRepo();
    const result = await new LockShift({ shifts, businessDays: new DayRepo('CLOSED'), events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }) })
      .execute({ shiftId: shift.id }, context);

    expect(result.success).toBe(true);
    expect(shifts.saved).toMatchObject({ status: 'LOCKED' });
  });
});
