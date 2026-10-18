import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import type { BusinessDay, BusinessDayWriteRepository } from '../business-days/index.js';
import type { Shift, ShiftRepository } from './ports.js';
import {
  resolveShiftBusinessDayWrite,
  sequentialShiftWriteGate,
  shiftWriteGateFor,
} from './resolve-shift-write.js';
import type {
  ShiftWriteGateReader,
  ShiftWriteGateRows,
  ShiftWriteLockTarget,
} from './resolve-shift-write.js';

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'shift-1',
    organizationId: 'org-1',
    stationId: 'station-1',
    businessDayId: 'day-1',
    shiftTemplateId: 'template-1',
    status: 'OPEN',
    openedBy: 'user-1',
    openedAt: '',
    closedBy: null,
    closedAt: null,
    lockedAt: null,
    openingCash: '0',
    closingCash: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function day(overrides: Partial<BusinessDay> = {}): BusinessDay {
  return {
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
    ...overrides,
  };
}

const ctx: ExecutionContext = {
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDayId: 'day-1',
  actorId: 'user-1',
  correlationId: null,
  clock: new FixedClock(new Date('2026-09-12T11:00:00Z')),
  ids: new SequentialIdGenerator('id'),
};

class FakeGate implements ShiftWriteGateReader {
  readonly calls: string[] = [];
  readonly lockTargets: ShiftWriteLockTarget[] = [];
  constructor(
    private readonly discovered: ShiftWriteGateRows,
    private readonly locked: ShiftWriteGateRows = discovered,
  ) {}
  async discover(shiftId: string) {
    this.calls.push(`discover:${shiftId}`);
    return this.discovered;
  }
  async lockForWrite(target: ShiftWriteLockTarget) {
    this.calls.push('lock');
    this.lockTargets.push(target);
    return this.locked;
  }
}

const notFound = (entity: string, id: string) => ({
  success: false,
  error: { code: 'NOT_FOUND', message: `${entity} (${id}) was not found`, details: { entity, id } },
});

describe('resolveShiftBusinessDayWrite over the ShiftWriteGateReader port', () => {
  it('discovers without locks, then locks Station -> Day -> Shift for the discovered parents', async () => {
    const gate = new FakeGate({ shift: shift(), businessDay: day() });
    const result = await resolveShiftBusinessDayWrite(gate, ctx, 'shift-1', 'STOCK');

    expect(gate.calls).toEqual(['discover:shift-1', 'lock']);
    expect(gate.lockTargets).toEqual([
      {
        organizationId: 'org-1',
        stationId: 'station-1',
        businessDayId: 'day-1',
        shiftId: 'shift-1',
      },
    ]);
    expect(result).toEqual({
      success: true,
      data: { businessDay: day(), lateEntry: false, shift: shift() },
    });
  });

  it('returns the rows read under the lock, not the discovered ones', async () => {
    const lockedShift = shift({ status: 'CLOSED', updatedAt: 'later' });
    const lockedDay = day({ updatedAt: 'later' });
    const gate = new FakeGate(
      { shift: shift(), businessDay: day() },
      { shift: lockedShift, businessDay: lockedDay },
    );
    const result = await resolveShiftBusinessDayWrite(gate, ctx, 'shift-1', 'FINANCIAL');
    expect(result).toEqual({
      success: true,
      data: { businessDay: lockedDay, lateEntry: false, shift: lockedShift },
    });
  });

  it.each([
    ['missing', null],
    ['in another organization', shift({ organizationId: 'org-2' })],
    ['at another station than the context', shift({ stationId: 'station-2' })],
  ])('rejects a shift %s as not found without taking any lock', async (_label, discovered) => {
    const gate = new FakeGate({ shift: discovered, businessDay: day() });
    const result = await resolveShiftBusinessDayWrite(gate, ctx, 'shift-1', 'STOCK');
    expect(result).toEqual(notFound('Shift', 'shift-1'));
    expect(gate.calls).toEqual(['discover:shift-1']);
  });

  it('skips the context station check when the context names no station', async () => {
    const gate = new FakeGate({
      shift: shift({ stationId: 'station-2' }),
      businessDay: day({ stationId: 'station-2' }),
    });
    const result = await resolveShiftBusinessDayWrite(
      gate,
      { ...ctx, stationId: null },
      'shift-1',
      'STOCK',
    );
    expect(result.success).toBe(true);
    expect(gate.lockTargets[0]?.stationId).toBe('station-2');
  });

  it.each([
    ['missing', null],
    ['in another organization', day({ organizationId: 'org-2' })],
    ['at another station than the shift', day({ stationId: 'station-2' })],
  ])('rejects a discovered Business Day %s without taking any lock', async (_label, discovered) => {
    const gate = new FakeGate({ shift: shift(), businessDay: discovered });
    const result = await resolveShiftBusinessDayWrite(gate, ctx, 'shift-1', 'STOCK');
    expect(result).toEqual(notFound('Business Day', 'day-1'));
    expect(gate.calls).toEqual(['discover:shift-1']);
  });

  it.each([
    ['missing', null],
    ['in another organization', day({ organizationId: 'org-2' })],
    ['at another station', day({ stationId: 'station-2' })],
  ])('revalidates a Business Day %s under the lock', async (_label, locked) => {
    const gate = new FakeGate(
      { shift: shift(), businessDay: day() },
      { shift: shift(), businessDay: locked },
    );
    const result = await resolveShiftBusinessDayWrite(gate, ctx, 'shift-1', 'STOCK');
    expect(result).toEqual(notFound('Business Day', 'day-1'));
  });

  it('refuses a STOCK write once the locked Business Day is closed', async () => {
    const gate = new FakeGate(
      { shift: shift(), businessDay: day() },
      { shift: shift(), businessDay: day({ status: 'CLOSED' }) },
    );
    const result = await resolveShiftBusinessDayWrite(gate, ctx, 'shift-1', 'STOCK');
    expect(result).toEqual({
      success: false,
      error: {
        code: 'INVARIANT_VIOLATION',
        message: 'Business day is closed; sales and stock records are sealed',
        details: { businessDayId: 'day-1', businessDate: '2026-09-12' },
      },
    });
  });

  it('allows a FINANCIAL write on a closed Business Day as a late entry', async () => {
    const closed = day({ status: 'CLOSED' });
    const gate = new FakeGate({ shift: shift(), businessDay: closed });
    const result = await resolveShiftBusinessDayWrite(gate, ctx, 'shift-1', 'FINANCIAL');
    expect(result).toEqual({
      success: true,
      data: { businessDay: closed, lateEntry: true, shift: shift() },
    });
  });

  it.each([
    ['missing', null],
    ['in another organization', shift({ organizationId: 'org-2' })],
    ['moved to another station', shift({ stationId: 'station-2' })],
    ['moved to another Business Day', shift({ businessDayId: 'day-2' })],
  ])('revalidates a shift %s under the lock', async (_label, locked) => {
    const gate = new FakeGate(
      { shift: shift(), businessDay: day() },
      { shift: locked, businessDay: day() },
    );
    const result = await resolveShiftBusinessDayWrite(gate, ctx, 'shift-1', 'STOCK');
    expect(result).toEqual(notFound('Shift', 'shift-1'));
  });

  it('revalidates a shift moved to another station when the context names no station', async () => {
    const gate = new FakeGate(
      { shift: shift(), businessDay: day() },
      { shift: shift({ stationId: 'station-2' }), businessDay: day() },
    );
    const result = await resolveShiftBusinessDayWrite(
      gate,
      { ...ctx, stationId: null },
      'shift-1',
      'STOCK',
    );
    expect(result).toEqual(notFound('Shift', 'shift-1'));
  });
});

describe('sequentialShiftWriteGate (repository-backed reference adapter)', () => {
  function repos(calls: string[], dayRow: BusinessDay | null = day()) {
    const shifts: ShiftRepository = {
      async findById() {
        calls.push('shift-lock');
        return shift();
      },
      async findByIdWithoutLock() {
        calls.push('shift-discovery');
        return shift();
      },
      async save() {},
      async findOpenByStation() {
        return null;
      },
      async addStaffAssignments() {},
      async addTerminalLinks() {},
    };
    const businessDays: BusinessDayWriteRepository = {
      async findById() {
        calls.push('day-find');
        return dayRow;
      },
      async save() {},
      async findOpenByStation() {
        return null;
      },
      async findByStationAndDate() {
        return null;
      },
      async lockStation(organizationId, stationId) {
        calls.push(`station-lock:${organizationId}:${stationId}`);
      },
      async lockById(organizationId, businessDayId) {
        calls.push(`day-lock:${organizationId}:${businessDayId}`);
      },
      async lockByStationAndDate() {
        calls.push('unexpected');
      },
    };
    return { shifts, businessDays };
  }

  it('reproduces the original discover -> lock -> re-read statement sequence', async () => {
    const calls: string[] = [];
    const gate = sequentialShiftWriteGate(repos(calls));
    const result = await resolveShiftBusinessDayWrite(gate, ctx, 'shift-1', 'STOCK');
    expect(result.success).toBe(true);
    expect(calls).toEqual([
      'shift-discovery',
      'day-find',
      'station-lock:org-1:station-1',
      'day-lock:org-1:day-1',
      'day-find',
      'shift-lock',
    ]);
  });

  it('does not read the Business Day when discovery finds no shift', async () => {
    const calls: string[] = [];
    const deps = repos(calls);
    deps.shifts.findByIdWithoutLock = async () => {
      calls.push('shift-discovery');
      return null;
    };
    const result = await resolveShiftBusinessDayWrite(
      sequentialShiftWriteGate(deps),
      ctx,
      'shift-1',
      'STOCK',
    );
    expect(result).toEqual(notFound('Shift', 'shift-1'));
    expect(calls).toEqual(['shift-discovery']);
  });

  it('shiftWriteGateFor prefers a consolidated gate over the repositories', async () => {
    const calls: string[] = [];
    const consolidated = new FakeGate({ shift: shift(), businessDay: day() });
    expect(shiftWriteGateFor({ ...repos(calls), shiftWriteGate: consolidated })).toBe(consolidated);
    const fallback = shiftWriteGateFor(repos(calls));
    await fallback.discover('shift-1');
    expect(calls).toEqual(['shift-discovery', 'day-find']);
  });
});
