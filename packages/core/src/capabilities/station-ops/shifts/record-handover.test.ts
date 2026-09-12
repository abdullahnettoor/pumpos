import { describe, expect, it } from 'vitest';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { RecordHandover } from './record-handover.js';
import type {
  AcceptedHandoverReading,
  AttendantHandover,
  HandoverContext,
  HandoverContextReader,
  HandoverRepository,
  HandoverTerminalEntry,
  Shift,
  ShiftRepository,
} from './ports.js';

class ShiftRepo implements ShiftRepository {
  constructor(readonly row: Shift | null = shift()) {}
  async findById(id: string) { return this.row?.id === id ? this.row : null; }
  async save() {}
  async findOpenByStation() { return this.row; }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}

class ContextReader implements HandoverContextReader {
  constructor(readonly value: HandoverContext = handoverContext()) {}
  async load() { return this.value; }
}

class HandoverRepo implements HandoverRepository {
  current: AttendantHandover | null = null;
  entries: HandoverTerminalEntry[] = [];
  readings: AcceptedHandoverReading[] = [];

  async replaceCurrent(handover: AttendantHandover, entries: HandoverTerminalEntry[]) {
    const replaced = this.current !== null;
    const saved = replaced ? { ...handover, id: this.current!.id } : handover;
    this.current = saved;
    this.entries = entries.map((entry) => ({ ...entry, handoverId: saved.id }));
    return { handover: saved, terminalEntries: this.entries, replaced };
  }
  async updateReadings(readings: AcceptedHandoverReading[]) { this.readings = readings; }
}

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'shift-1', organizationId: 'org-1', stationId: 'station-1', businessDayId: 'day-1',
    shiftTemplateId: 'template-1', status: 'OPEN', openedBy: 'manager-1', openedAt: '',
    closedBy: null, closedAt: null, lockedAt: null, openingCash: '0', closingCash: null,
    createdAt: '', updatedAt: '', ...overrides,
  };
}

function handoverContext(overrides: Partial<HandoverContext> = {}): HandoverContext {
  return {
    attendant: { id: 'attendant-1', organizationId: 'org-1', fullName: 'Asha Nair', role: 'Attendant', status: 'ACTIVE' },
    dispenser: { id: 'du-1', organizationId: 'org-1', stationId: 'station-1', name: 'Dispenser 1', code: 'DU-1', status: 'ACTIVE' },
    assigned: true,
    nozzleReadings: [
      {
        id: 'reading-1', shiftId: 'shift-1', nozzleId: 'nozzle-1', organizationId: 'org-1', stationId: 'station-1',
        duId: 'du-1', nozzleName: 'N1', openingReading: '100', closingReading: '100', volumeSold: '0',
        testingVolume: '0', unitPrice: '100.005', createdAt: '',
      },
    ],
    missingReadingNozzleIds: [],
    terminals: [], creditSales: 0, omcCardSales: 0, merchandiseCash: 0, ...overrides,
  };
}

function context(): ExecutionContext {
  return {
    organizationId: 'org-1', stationId: 'station-1', businessDayId: 'day-1', actorId: 'manager-1',
    correlationId: 'correlation-1', actorSnapshot: { kind: 'tenant_user', displayName: 'Manager', role: 'Manager' },
    clock: new FixedClock(new Date('2026-09-12T08:00:00.000Z')), ids: new SequentialIdGenerator('id'),
  };
}

function command() {
  return {
    shiftId: 'shift-1', attendantId: 'attendant-1', duId: 'du-1', cashHandedOver: 0,
    nozzleReadings: [{ nozzleId: 'nozzle-1', closingReading: 110, testingVolume: 1 }],
  };
}

function setup(source = handoverContext(), shiftRow = shift()) {
  const handovers = new HandoverRepo();
  const store = new InMemoryEventStore();
  const useCase = new RecordHandover({
    shifts: new ShiftRepo(shiftRow),
    context: new ContextReader(source),
    handovers,
    events: new InProcessEventDispatcher({ store }),
  });
  return { useCase, handovers, store };
}

describe('RecordHandover', () => {
  it('preserves the current fuel, product-cash, declarations, and paise-rounding formula', async () => {
    const source = handoverContext({ creditSales: 200, omcCardSales: 100, merchandiseCash: 50 });
    source.terminals = [{
      id: 'terminal-1', organizationId: 'org-1', stationId: 'station-1', label: 'T1',
      supportsCard: true, supportsUpi: true, isActive: true, linkedDuId: 'du-1',
    }];
    const { useCase, handovers, store } = setup(source);
    const result = await useCase.execute({
      ...command(),
      cashHandedOver: 400,
      cardHandedOver: 9999,
      upiHandedOver: 9999,
      terminalEntries: [{ terminalId: 'terminal-1', cardAmount: 250, upiAmount: 100 }],
      expectedSales: 1,
      varianceAmount: 1,
      creditHandedOver: 1,
    } as any, context());

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Fuel: (110 - 100 - 1) * 100.005 = 900.045; expected total adds ₹50 merchandise cash.
    expect(result.data.expectedFuelSales).toBeCloseTo(900.045);
    expect(result.data.expectedSales).toBeCloseTo(900.045);
    expect(result.data.expectedTotal).toBeCloseTo(950.045);
    expect(result.data.declaredTotal).toBe(1050);
    expect(result.data.varianceAmount).toBe(99.96);
    expect(result.data.creditSales).toBe(200);
    expect(result.data.omcCardSales).toBe(100);
    expect(result.data.handover.cardHandedOver).toBe('250');
    expect(result.data.handover.upiHandedOver).toBe('100');
    expect(result.data.handover.creditHandedOver).toBe('200');
    expect(result.data.handover.expectedSales).toBe('900.045');
    expect(handovers.readings[0]).toMatchObject({ grossVolume: 10, testingVolume: 1, netVolume: 9 });
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({
      eventType: BusinessEvents.HANDOVER_RECORDED,
      aggregateId: result.data.handover.id,
      correlationId: 'correlation-1',
      metadata: {
        grouping: { role: 'primary' },
        presentation: { templateId: 'handover-recorded.v1', values: { attendantName: 'Asha Nair', duName: 'Dispenser 1' } },
      },
    });
  });

  it('accepts aggregate card and UPI declarations only when no terminals are configured', async () => {
    const aggregate = await setup().useCase.execute({ ...command(), cardHandedOver: 50, upiHandedOver: 25 }, context());
    expect(aggregate.success).toBe(true);
    if (aggregate.success) expect(aggregate.data.declaredTotal).toBe(75);

    const configured = handoverContext({ terminals: [{
      id: 'terminal-1', organizationId: 'org-1', stationId: 'station-1', label: 'T1',
      supportsCard: true, supportsUpi: true, isActive: true, linkedDuId: 'du-1',
    }] });
    const rejected = await setup(configured).useCase.execute({ ...command(), cardHandedOver: 50 }, context());
    expect(rejected.success).toBe(false);
    if (!rejected.success) expect(rejected.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects closed shifts, missing assignments, and incomplete Nozzle sets', async () => {
    const closed = await setup(handoverContext(), shift({ status: 'CLOSED' })).useCase.execute(command(), context());
    expect(closed.success).toBe(false);
    if (!closed.success) expect(closed.error.code).toBe('INVARIANT_VIOLATION');

    const unassigned = await setup(handoverContext({ assigned: false })).useCase.execute(command(), context());
    expect(unassigned.success).toBe(false);
    if (!unassigned.success) expect(unassigned.error.code).toBe('INVARIANT_VIOLATION');

    const missing = await setup().useCase.execute({ ...command(), nozzleReadings: [{ nozzleId: 'other', closingReading: 110 }] }, context());
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.code).toBe('VALIDATION_ERROR');

    const missingSeed = await setup(handoverContext({ missingReadingNozzleIds: ['nozzle-2'] })).useCase.execute(command(), context());
    expect(missingSeed.success).toBe(false);
    if (!missingSeed.success) expect(missingSeed.error.code).toBe('INVARIANT_VIOLATION');
  });

  it('rejects duplicate IDs, invalid readings, and unrelated terminals', async () => {
    const duplicate = await setup().useCase.execute({
      ...command(), nozzleReadings: [command().nozzleReadings[0], command().nozzleReadings[0]],
    }, context());
    expect(duplicate.success).toBe(false);

    const belowOpening = await setup().useCase.execute({
      ...command(), nozzleReadings: [{ nozzleId: 'nozzle-1', closingReading: 99 }],
    }, context());
    expect(belowOpening.success).toBe(false);

    const excessiveTesting = await setup().useCase.execute({
      ...command(), nozzleReadings: [{ nozzleId: 'nozzle-1', closingReading: 101, testingVolume: 2 }],
    }, context());
    expect(excessiveTesting.success).toBe(false);

    const unrelatedTerminal = await setup().useCase.execute({
      ...command(), terminalEntries: [{ terminalId: 'other-terminal', cardAmount: 10, upiAmount: 0 }],
    }, context());
    expect(unrelatedTerminal.success).toBe(false);
  });

  it('replaces the current declaration while preserving an event for each accepted command', async () => {
    const { useCase, handovers, store } = setup();
    const first = await useCase.execute({ ...command(), cashHandedOver: 900 }, context());
    const second = await useCase.execute({ ...command(), cashHandedOver: 901 }, context());

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(second.data.replaced).toBe(true);
    expect(second.data.handover.id).toBe(first.data.handover.id);
    expect(handovers.current?.cashHandedOver).toBe('901');
    expect(store.events).toHaveLength(2);
    expect(store.events.map((event) => event.payload)).toEqual([
      expect.objectContaining({ disposition: 'CREATED' }),
      expect.objectContaining({ disposition: 'REPLACED' }),
    ]);
  });
});
