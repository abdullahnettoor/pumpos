import { describe, expect, it } from 'vitest';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import type { BusinessDay, BusinessDayWriteRepository } from '../business-days/index.js';
import { RecordNozzleReadings } from './record-nozzle-readings.js';
import type { NozzleReading, NozzleReadingRepository, Shift, ShiftRepository } from './ports.js';

function shift(status: Shift['status'] = 'OPEN', overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'shift-1',
    organizationId: 'org-1',
    stationId: 'station-1',
    businessDayId: 'day-1',
    shiftTemplateId: 'template-1',
    status,
    openedBy: 'manager-1',
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

class ShiftRepo implements ShiftRepository {
  constructor(
    private readonly row: Shift,
    private readonly calls: string[],
  ) {}
  async findById() {
    this.calls.push('shift-lock');
    return this.row;
  }
  async findByIdWithoutLock() {
    this.calls.push('shift-discovery');
    return this.row;
  }
  async save() {}
  async findOpenByStation() {
    return this.row.status === 'OPEN' ? this.row : null;
  }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}

class BusinessDayRepo implements BusinessDayWriteRepository {
  constructor(
    private readonly status: BusinessDay['status'],
    private readonly calls: string[],
  ) {}
  private row(): BusinessDay {
    return {
      id: 'day-1',
      organizationId: 'org-1',
      stationId: 'station-1',
      businessDate: '2026-09-12',
      status: this.status,
      openedBy: 'manager-1',
      openedAt: '',
      closedBy: null,
      closedAt: null,
      createdAt: '',
      updatedAt: '',
    };
  }
  async findById() {
    this.calls.push('day-find');
    return this.row();
  }
  async save() {}
  async findOpenByStation() {
    return this.status === 'OPEN' ? this.row() : null;
  }
  async findByStationAndDate() {
    return this.row();
  }
  async lockStation() {
    this.calls.push('station-lock');
  }
  async lockById() {
    this.calls.push('day-lock');
  }
  async lockByStationAndDate() {}
}

class ReadingRepo implements NozzleReadingRepository {
  updates: Array<{ id: string; closingReading: string; volumeSold: string }> = [];
  async lastClosingByNozzleIds() {
    return new Map<string, number>();
  }
  async saveMany() {}
  async listByShift(): Promise<NozzleReading[]> {
    return [
      {
        id: 'reading-1',
        shiftId: 'shift-1',
        nozzleId: 'nozzle-1',
        openingReading: '100',
        closingReading: '100',
        volumeSold: '0',
        testingVolume: '0',
        unitPrice: '100',
        createdAt: '',
      },
    ];
  }
  async updateClosing(id: string, closingReading: string, volumeSold: string) {
    this.updates.push({ id, closingReading, volumeSold });
  }
}

const ctx: ExecutionContext = {
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDayId: 'day-1',
  actorId: 'manager-1',
  correlationId: 'correlation-1',
  clock: new FixedClock(new Date('2026-09-12T08:00:00.000Z')),
  ids: new SequentialIdGenerator('id'),
};

function setup(
  shiftStatus: Shift['status'] = 'OPEN',
  dayStatus: BusinessDay['status'] = 'OPEN',
  shiftOverrides: Partial<Shift> = {},
) {
  const calls: string[] = [];
  const readings = new ReadingRepo();
  const store = new InMemoryEventStore();
  const useCase = new RecordNozzleReadings({
    shifts: new ShiftRepo(shift(shiftStatus, shiftOverrides), calls),
    businessDays: new BusinessDayRepo(dayStatus, calls),
    nozzleReadings: readings,
    events: new InProcessEventDispatcher({ store }),
  });
  return { useCase, calls, readings, store };
}

describe('RecordNozzleReadings', () => {
  it('records closing readings for an open Shift and emits an event', async () => {
    const { useCase, readings, store } = setup();

    const result = await useCase.execute(
      { shiftId: 'shift-1', readings: [{ nozzleId: 'nozzle-1', closingReading: 112 }] },
      ctx,
    );

    expect(result).toEqual({
      success: true,
      data: { shiftId: 'shift-1', updated: 1, totalVolume: 12 },
    });
    expect(readings.updates).toEqual([
      { id: 'reading-1', closingReading: '112', volumeSold: '12' },
    ]);
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({
      eventType: BusinessEvents.NOZZLE_READING_RECORDED,
      aggregateId: 'shift-1',
    });
  });

  it.each(['CLOSED', 'LOCKED'] as const)(
    'rejects a %s Shift without reading or event effects',
    async (status) => {
      const { useCase, readings, store } = setup(status);

      const result = await useCase.execute(
        { shiftId: 'shift-1', readings: [{ nozzleId: 'nozzle-1', closingReading: 112 }] },
        ctx,
      );

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
      expect(readings.updates).toEqual([]);
      expect(store.events).toEqual([]);
    },
  );

  it('rejects a closed parent Business Day without reading or event effects', async () => {
    const { useCase, readings, store } = setup('OPEN', 'CLOSED');

    const result = await useCase.execute(
      { shiftId: 'shift-1', readings: [{ nozzleId: 'nozzle-1', closingReading: 112 }] },
      ctx,
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
    expect(readings.updates).toEqual([]);
    expect(store.events).toEqual([]);
  });

  it('locks Station, Business Day, then Shift before updating readings', async () => {
    const { useCase, calls } = setup();

    const result = await useCase.execute(
      { shiftId: 'shift-1', readings: [{ nozzleId: 'nozzle-1', closingReading: 112 }] },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      'shift-discovery',
      'day-find',
      'station-lock',
      'day-lock',
      'day-find',
      'shift-lock',
    ]);
  });

  it('rejects a Shift outside the context Station without writes, events, or foreign locks', async () => {
    const { useCase, calls, readings, store } = setup('OPEN', 'OPEN', { stationId: 'station-2' });

    const result = await useCase.execute(
      { shiftId: 'shift-1', readings: [{ nozzleId: 'nozzle-1', closingReading: 112 }] },
      ctx,
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    expect(calls).toEqual(['shift-discovery']);
    expect(readings.updates).toEqual([]);
    expect(store.events).toEqual([]);
  });
});
