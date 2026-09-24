import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  RecordHandover,
  SequentialIdGenerator,
  type AcceptedHandoverReading,
  type AttendantHandover,
  type BusinessDay,
  type BusinessDayWriteRepository,
  type DomainEvent,
  type EventPublisher,
  type ExecutionContext,
  type HandoverContext,
  type HandoverContextReader,
  type HandoverRepository,
  type HandoverTerminalEntry,
  type Shift,
  type ShiftRepository,
} from '@pump/core';
import type { DbClient } from '@pump/db';
import { runInTransaction } from './transaction.js';

interface HandoverState {
  handover: AttendantHandover;
  terminalEntries: HandoverTerminalEntry[];
  readings: AcceptedHandoverReading[];
  events: DomainEvent[];
}

const shift: Shift = {
  id: 'shift-1',
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDayId: 'day-1',
  shiftTemplateId: 'template-1',
  status: 'OPEN',
  openedBy: 'manager-1',
  openedAt: '',
  closedBy: null,
  closedAt: null,
  lockedAt: null,
  openingCash: '0',
  closingCash: null,
  createdAt: '',
  updatedAt: '',
};

const businessDay: BusinessDay = {
  id: 'day-1',
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDate: '2026-09-12',
  status: 'OPEN',
  openedBy: 'manager-1',
  openedAt: '',
  closedBy: null,
  closedAt: null,
  createdAt: '',
  updatedAt: '',
};

const handoverContext: HandoverContext = {
  attendant: {
    id: 'attendant-1',
    organizationId: 'org-1',
    fullName: 'Asha Nair',
    role: 'Attendant',
    status: 'ACTIVE',
  },
  dispenser: {
    id: 'du-1',
    organizationId: 'org-1',
    stationId: 'station-1',
    name: 'Dispenser 1',
    code: 'DU-1',
    status: 'ACTIVE',
  },
  assigned: true,
  nozzleReadings: [
    {
      id: 'reading-1',
      shiftId: 'shift-1',
      nozzleId: 'nozzle-1',
      organizationId: 'org-1',
      stationId: 'station-1',
      duId: 'du-1',
      nozzleName: 'N1',
      openingReading: '100',
      closingReading: '109',
      volumeSold: '9',
      testingVolume: '1',
      unitPrice: '100',
      createdAt: '',
    },
  ],
  missingReadingNozzleIds: [],
  terminals: [
    {
      id: 'terminal-1',
      organizationId: 'org-1',
      stationId: 'station-1',
      label: 'T1',
      supportsCard: true,
      supportsUpi: true,
      isActive: true,
      linkedDuId: 'du-1',
    },
  ],
  creditSales: 0,
  omcCardSales: 0,
  merchandiseCash: 0,
  openingFloat: 0,
};

const initial: HandoverState = {
  handover: {
    id: 'existing-handover',
    organizationId: 'org-1',
    stationId: 'station-1',
    shiftId: 'shift-1',
    attendantId: 'attendant-1',
    duId: 'du-1',
    cashHandedOver: '800',
    cardHandedOver: '100',
    upiHandedOver: '50',
    creditHandedOver: '0',
    testingVolume: '1',
    expectedSales: '800',
    openingFloat: '0',
    cashDrops: '0',
    expectedCash: '650',
    varianceAmount: '150',
    createdAt: '2026-09-12T07:00:00.000Z',
  },
  terminalEntries: [
    {
      id: 'existing-entry',
      handoverId: 'existing-handover',
      terminalId: 'terminal-1',
      duId: 'du-1',
      cardAmount: '100',
      upiAmount: '50',
      batchRef: 'old-batch',
      createdAt: '2026-09-12T07:00:00.000Z',
    },
  ],
  readings: [
    {
      id: 'reading-1',
      nozzleId: 'nozzle-1',
      openingReading: 100,
      closingReading: 109,
      grossVolume: 9,
      testingVolume: 1,
      netVolume: 8,
      unitPrice: 100,
      expectedSales: 800,
    },
  ],
  events: [],
};

function transactionalDb(committed: HandoverState) {
  const states = new WeakMap<object, HandoverState>();
  const db = {
    transaction: async (execute: (tx: DbClient) => Promise<unknown>) => {
      const draft = structuredClone(committed);
      const tx = {} as DbClient;
      states.set(tx as object, draft);
      const result = await execute(tx);
      Object.assign(committed, structuredClone(draft));
      return result;
    },
  } as unknown as DbClient;
  return { db, stateFor: (tx: DbClient) => states.get(tx as object)! };
}

class ShiftRepo implements ShiftRepository {
  async findById() {
    return shift;
  }
  async findByIdWithoutLock() {
    return shift;
  }
  async save() {}
  async findOpenByStation() {
    return shift;
  }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}

class BusinessDayRepo implements BusinessDayWriteRepository {
  async findById() {
    return businessDay;
  }
  async save() {}
  async findOpenByStation() {
    return businessDay;
  }
  async findByStationAndDate() {
    return businessDay;
  }
  async lockStation() {}
  async lockById() {}
  async lockByStationAndDate() {}
}

class ContextReader implements HandoverContextReader {
  async load() {
    return handoverContext;
  }
}

class HandoverRepo implements HandoverRepository {
  constructor(private readonly state: HandoverState) {}

  async replaceCurrent(handover: AttendantHandover, terminalEntries: HandoverTerminalEntry[]) {
    const saved = { ...handover, id: this.state.handover.id };
    this.state.handover = saved;
    this.state.terminalEntries = terminalEntries.map((entry) => ({
      ...entry,
      handoverId: saved.id,
    }));
    return { handover: saved, terminalEntries: this.state.terminalEntries, replaced: true };
  }

  async updateReadings(readings: AcceptedHandoverReading[]) {
    this.state.readings = structuredClone(readings);
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

describe('runInTransaction Handover atomicity', () => {
  it('rolls back handover replacement, terminal entries, readings, and outbox append when event persistence fails', async () => {
    const committed = structuredClone(initial);
    const { db, stateFor } = transactionalDb(committed);

    await expect(
      runInTransaction(
        db,
        async (tx, events) => {
          const useCase = new RecordHandover({
            shifts: new ShiftRepo(),
            businessDays: new BusinessDayRepo(),
            context: new ContextReader(),
            handovers: new HandoverRepo(stateFor(tx)),
            events,
          });
          return useCase.execute(
            {
              shiftId: 'shift-1',
              attendantId: 'attendant-1',
              duId: 'du-1',
              cashHandedOver: 900,
              nozzleReadings: [{ nozzleId: 'nozzle-1', closingReading: 112, testingVolume: 1 }],
              terminalEntries: [
                { terminalId: 'terminal-1', cardAmount: 200, upiAmount: 75, batchRef: 'new-batch' },
              ],
            },
            ctx,
          );
        },
        (tx): EventPublisher => ({
          publish: async (events) => {
            const draft = stateFor(tx);
            expect(draft.handover.cashHandedOver).toBe('900');
            expect(draft.terminalEntries).toEqual([
              expect.objectContaining({
                cardAmount: '200',
                upiAmount: '75',
                batchRef: 'new-batch',
              }),
            ]);
            expect(draft.readings).toEqual([
              expect.objectContaining({ closingReading: 112, testingVolume: 1 }),
            ]);
            draft.events.push(...events);
            expect(draft.events).toHaveLength(1);
            throw new Error('injected event append failure');
          },
        }),
      ),
    ).rejects.toThrow('injected event append failure');

    expect(committed).toEqual(initial);
  });
});
