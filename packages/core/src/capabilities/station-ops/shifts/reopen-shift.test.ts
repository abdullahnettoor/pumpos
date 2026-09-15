import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import type {
  BusinessDay,
  BusinessDayLock,
  BusinessDayRepository,
} from '../business-days/index.js';
import { ReopenShift } from './reopen-shift.js';
import type { Shift, ShiftRepository, ShiftSummaryWriter } from './ports.js';

class ShiftRepo implements ShiftRepository {
  saved: Shift | null = null;

  constructor(
    readonly row: Shift,
    private readonly openShift: Shift | null = null,
    private readonly calls?: string[],
  ) {}

  async findByIdWithoutLock(id: string) {
    this.calls?.push('shift-discovery');
    return id === this.row.id ? this.row : null;
  }

  async findById(id: string) {
    this.calls?.push('shift-lock');
    return id === this.row.id ? this.row : null;
  }

  async save(shift: Shift) {
    this.saved = shift;
  }
  async findOpenByStation() {
    return this.openShift;
  }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}

class BusinessDayRepo implements BusinessDayRepository, BusinessDayLock {
  constructor(
    readonly row: BusinessDay,
    private readonly calls?: string[],
  ) {}
  async findById(id: string) {
    this.calls?.push('day-read');
    return id === this.row.id ? this.row : null;
  }
  async save() {}
  async findOpenByStation() {
    return this.row.status === 'OPEN' ? this.row : null;
  }
  async findByStationAndDate() {
    return this.row;
  }
  async lockStation() {
    this.calls?.push('station-lock');
  }
  async lockById() {
    this.calls?.push('day-lock');
  }
  async lockByStationAndDate() {}
}

class SummaryWriter implements ShiftSummaryWriter {
  deleted = false;
  async save() {}
  async deleteForShift() {
    this.deleted = true;
  }
}

const shift: Shift = {
  id: 'shift-1',
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDayId: 'day-1',
  shiftTemplateId: 'template-1',
  status: 'CLOSED',
  openedBy: 'user-1',
  openedAt: '',
  closedBy: 'user-1',
  closedAt: '2026-09-12T09:00:00Z',
  lockedAt: null,
  openingCash: '0',
  closingCash: '100',
  createdAt: '',
  updatedAt: '',
};

const openDay: BusinessDay = {
  id: 'day-1',
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDate: '2026-09-12',
  status: 'OPEN',
  openedBy: 'user-1',
  openedAt: '',
  closedBy: null,
  closedAt: null,
  createdAt: '',
  updatedAt: '',
};

const context: ExecutionContext = {
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDayId: 'day-1',
  actorId: 'user-1',
  correlationId: null,
  clock: new FixedClock(new Date('2026-09-12T10:00:00Z')),
  ids: new SequentialIdGenerator('id'),
};

function dependencies(
  shifts = new ShiftRepo(shift),
  day = openDay,
  calls?: string[],
  hasTankDip = false,
) {
  const businessDays = new BusinessDayRepo(day, calls);
  const summaries = new SummaryWriter();
  return {
    deps: {
      shifts,
      businessDays,
      summaries,
      stockVariances: {
        async existsForShift() {
          return hasTankDip;
        },
      } as any,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    },
    summaries,
  };
}

describe('ReopenShift', () => {
  it('reopens a closed Shift while its Business Day is open', async () => {
    const shifts = new ShiftRepo(shift);
    const { deps, summaries } = dependencies(shifts);

    const result = await new ReopenShift(deps).execute({ shiftId: shift.id }, context);

    expect(result.success).toBe(true);
    expect(shifts.saved).toMatchObject({
      status: 'OPEN',
      closedAt: null,
      closedBy: null,
      closingCash: null,
    });
    expect(summaries.deleted).toBe(true);
  });

  it('rejects reopening after the parent Business Day is closed', async () => {
    const closedDay: BusinessDay = {
      ...openDay,
      status: 'CLOSED',
      closedAt: '2026-09-12T09:30:00Z',
    };
    const { deps } = dependencies(new ShiftRepo(shift), closedDay);

    const result = await new ReopenShift(deps).execute({ shiftId: shift.id }, context);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVARIANT_VIOLATION');
      expect(result.error.message).toContain('Business Day is closed');
    }
  });

  it('rejects reopening while another Shift is open at the Station', async () => {
    const otherOpenShift: Shift = {
      ...shift,
      id: 'shift-2',
      status: 'OPEN',
      closedAt: null,
      closedBy: null,
      closingCash: null,
    };
    const { deps } = dependencies(new ShiftRepo(shift, otherOpenShift));

    const result = await new ReopenShift(deps).execute({ shiftId: shift.id }, context);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('another shift is currently open');
  });

  it('rejects reopening when the Shift has an attributed Tank Dip', async () => {
    const { deps } = dependencies(new ShiftRepo(shift), openDay, undefined, true);

    const result = await new ReopenShift(deps).execute({ shiftId: shift.id }, context);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('attributed Tank Dip');
  });

  it('locks Station, Business Day, then Shift after the unlocked discovery read', async () => {
    const calls: string[] = [];
    const shifts = new ShiftRepo(shift, null, calls);
    const { deps } = dependencies(shifts, openDay, calls);

    const result = await new ReopenShift(deps).execute({ shiftId: shift.id }, context);

    expect(result.success).toBe(true);
    expect(calls.slice(0, 5)).toEqual([
      'shift-discovery',
      'station-lock',
      'day-lock',
      'shift-lock',
      'day-read',
    ]);
  });

  it('reopens a legacy locked Shift while its Business Day is open', async () => {
    const locked = { ...shift, status: 'LOCKED' as const, lockedAt: '2026-09-12T09:30:00Z' };
    const shifts = new ShiftRepo(locked);
    const { deps } = dependencies(shifts);

    const result = await new ReopenShift(deps).execute({ shiftId: locked.id }, context);

    expect(result.success).toBe(true);
    expect(shifts.saved).toMatchObject({ status: 'OPEN', lockedAt: null });
  });
});
