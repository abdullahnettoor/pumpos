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
  constructor(
    readonly row: Shift | null = shift(),
    private readonly calls: string[] = [],
  ) {}
  async findById(id: string) {
    this.calls.push('shift-lock');
    return this.row?.id === id ? this.row : null;
  }
  async findByIdWithoutLock(id: string) {
    this.calls.push('shift-discovery');
    return this.row?.id === id ? this.row : null;
  }
  async save() {}
  async findOpenByStation() {
    return this.row;
  }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}

class BusinessDayRepo implements BusinessDayWriteRepository {
  constructor(
    private readonly status: BusinessDay['status'] = 'OPEN',
    private readonly calls: string[] = [],
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

class ContextReader implements HandoverContextReader {
  constructor(readonly value: HandoverContext = handoverContext()) {}
  async load() {
    return this.value;
  }
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
  async updateReadings(readings: AcceptedHandoverReading[]) {
    this.readings = readings;
  }
}

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
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
    ...overrides,
  };
}

function handoverContext(overrides: Partial<HandoverContext> = {}): HandoverContext {
  return {
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
        closingReading: '100',
        volumeSold: '0',
        testingVolume: '0',
        unitPrice: '100.005',
        createdAt: '',
      },
    ],
    missingReadingNozzleIds: [],
    terminals: [],
    creditSales: 0,
    omcCardSales: 0,
    merchandiseCash: 0,
    ...overrides,
  };
}

function context(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'station-1',
    businessDayId: 'day-1',
    actorId: 'manager-1',
    correlationId: 'correlation-1',
    actorSnapshot: { kind: 'tenant_user', displayName: 'Manager', role: 'Manager' },
    clock: new FixedClock(new Date('2026-09-12T08:00:00.000Z')),
    ids: new SequentialIdGenerator('id'),
  };
}

function command() {
  return {
    shiftId: 'shift-1',
    attendantId: 'attendant-1',
    duId: 'du-1',
    cashHandedOver: 0,
    nozzleReadings: [{ nozzleId: 'nozzle-1', closingReading: 110, testingVolume: 1 }],
  };
}

function setup(
  source = handoverContext(),
  shiftRow = shift(),
  dayStatus: BusinessDay['status'] = 'OPEN',
) {
  const handovers = new HandoverRepo();
  const store = new InMemoryEventStore();
  const calls: string[] = [];
  const useCase = new RecordHandover({
    shifts: new ShiftRepo(shiftRow, calls),
    businessDays: new BusinessDayRepo(dayStatus, calls),
    context: new ContextReader(source),
    handovers,
    events: new InProcessEventDispatcher({ store }),
  });
  return { useCase, handovers, store, calls };
}

describe('RecordHandover', () => {
  it('preserves the current fuel, product-cash, declarations, and paise-rounding formula', async () => {
    const source = handoverContext({ creditSales: 200, omcCardSales: 100, merchandiseCash: 50 });
    source.terminals = [
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
    ];
    const { useCase, handovers, store } = setup(source);
    const result = await useCase.execute(
      {
        ...command(),
        cashHandedOver: 400,
        terminalEntries: [{ terminalId: 'terminal-1', cardAmount: 250, upiAmount: 100 }],
      },
      context(),
    );

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
    expect(handovers.readings[0]).toMatchObject({
      grossVolume: 10,
      testingVolume: 1,
      netVolume: 9,
    });
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({
      eventType: BusinessEvents.HANDOVER_RECORDED,
      aggregateId: result.data.handover.id,
      correlationId: 'correlation-1',
      metadata: {
        grouping: { role: 'primary' },
        presentation: {
          templateId: 'handover-recorded.v1',
          values: { attendantName: 'Asha Nair', duName: 'Dispenser 1' },
        },
      },
    });
  });

  it.each(['Owner', 'Manager', 'Accountant', 'Staff'])(
    'allows an active assigned %s to record a handover',
    async (role) => {
      const base = handoverContext();
      const result = await setup(
        handoverContext({ attendant: { ...base.attendant!, role } }),
      ).useCase.execute(command(), context());

      expect(result.success).toBe(true);
    },
  );

  it.each([
    'expectedSales',
    'varianceAmount',
    'creditHandedOver',
    'creditSales',
    'omcCardHandedOver',
    'omcCardSales',
  ])('rejects the client-supplied conclusion %s', async (field) => {
    const result = await setup().useCase.execute({ ...command(), [field]: 1 } as any, context());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts aggregate card and UPI declarations only when no terminals are configured', async () => {
    const aggregate = await setup().useCase.execute(
      { ...command(), cardHandedOver: 50, upiHandedOver: 25 },
      context(),
    );
    expect(aggregate.success).toBe(true);
    if (aggregate.success) expect(aggregate.data.declaredTotal).toBe(75);

    const configured = handoverContext({
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
    });
    const rejected = await setup(configured).useCase.execute(
      { ...command(), cardHandedOver: 50 },
      context(),
    );
    expect(rejected.success).toBe(false);
    if (!rejected.success) expect(rejected.error.code).toBe('VALIDATION_ERROR');

    const zeroAggregate = await setup(configured).useCase.execute(
      { ...command(), cardHandedOver: 0 },
      context(),
    );
    expect(zeroAggregate.success).toBe(false);
    if (!zeroAggregate.success) expect(zeroAggregate.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a shift-wide Payment Terminal for a Dispenser Handover', async () => {
    const configured = handoverContext({
      terminals: [
        {
          id: 'terminal-1',
          organizationId: 'org-1',
          stationId: 'station-1',
          label: 'Shared T1',
          supportsCard: true,
          supportsUpi: true,
          isActive: true,
          linkedDuId: null,
        },
      ],
    });
    const result = await setup(configured).useCase.execute(
      {
        ...command(),
        terminalEntries: [{ terminalId: 'terminal-1', cardAmount: 50, upiAmount: 25 }],
      },
      context(),
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.declaredTotal).toBe(75);
  });

  it('rejects missing assignments and incomplete Nozzle sets', async () => {
    const unassigned = await setup(handoverContext({ assigned: false })).useCase.execute(
      command(),
      context(),
    );
    expect(unassigned.success).toBe(false);
    if (!unassigned.success) expect(unassigned.error.code).toBe('INVARIANT_VIOLATION');

    const missing = await setup().useCase.execute(
      { ...command(), nozzleReadings: [{ nozzleId: 'other', closingReading: 110 }] },
      context(),
    );
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.code).toBe('VALIDATION_ERROR');

    const missingSeed = await setup(
      handoverContext({ missingReadingNozzleIds: ['nozzle-2'] }),
    ).useCase.execute(command(), context());
    expect(missingSeed.success).toBe(false);
    if (!missingSeed.success) expect(missingSeed.error.code).toBe('INVARIANT_VIOLATION');
  });

  it.each(['CLOSED', 'LOCKED'] as const)(
    'rejects a %s Shift without handover, reading, or event effects',
    async (status) => {
      const { useCase, handovers, store } = setup(handoverContext(), shift({ status }));
      const existingHandover: AttendantHandover = {
        id: 'existing-handover',
        organizationId: 'org-1',
        stationId: 'station-1',
        shiftId: 'shift-1',
        attendantId: 'attendant-1',
        duId: 'du-1',
        cashHandedOver: '800',
        cardHandedOver: '100',
        upiHandedOver: '50',
        creditHandedOver: '25',
        testingVolume: '1',
        expectedSales: '975',
        varianceAmount: '0',
        createdAt: '2026-09-12T07:00:00.000Z',
      };
      const existingEntry: HandoverTerminalEntry = {
        id: 'existing-entry',
        handoverId: existingHandover.id,
        terminalId: 'terminal-1',
        duId: 'du-1',
        cardAmount: '100',
        upiAmount: '50',
        batchRef: 'batch-1',
        createdAt: existingHandover.createdAt,
      };
      const existingReading: AcceptedHandoverReading = {
        id: 'reading-1',
        nozzleId: 'nozzle-1',
        openingReading: 100,
        closingReading: 109,
        grossVolume: 9,
        testingVolume: 1,
        netVolume: 8,
        unitPrice: 100,
        expectedSales: 800,
      };
      handovers.current = existingHandover;
      handovers.entries = [existingEntry];
      handovers.readings = [existingReading];

      const result = await useCase.execute(command(), context());

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
      expect(handovers.current).toEqual(existingHandover);
      expect(handovers.entries).toEqual([existingEntry]);
      expect(handovers.readings).toEqual([existingReading]);
      expect(store.events).toEqual([]);
    },
  );

  it('rejects a closed parent Business Day without handover, reading, or event effects', async () => {
    const { useCase, handovers, store } = setup(handoverContext(), shift(), 'CLOSED');

    const result = await useCase.execute(command(), context());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
    expect(handovers.current).toBeNull();
    expect(handovers.readings).toEqual([]);
    expect(store.events).toEqual([]);
  });

  it('locks Station, Business Day, then Shift before recording a handover', async () => {
    const { useCase, calls } = setup();

    const result = await useCase.execute(command(), context());

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

  it('rejects cross-tenant and cross-Station Shift context', async () => {
    const foreignTenant = await setup(
      handoverContext(),
      shift({ organizationId: 'org-2' }),
    ).useCase.execute(command(), context());
    expect(foreignTenant.success).toBe(false);
    if (!foreignTenant.success) expect(foreignTenant.error.code).toBe('NOT_FOUND');

    const foreignStation = await setup(
      handoverContext(),
      shift({ stationId: 'station-2' }),
    ).useCase.execute(command(), context());
    expect(foreignStation.success).toBe(false);
    if (!foreignStation.success) expect(foreignStation.error.code).toBe('NOT_FOUND');
  });

  it('rejects cross-tenant Attendants, Dispensers, Nozzle Readings, and Payment Terminals', async () => {
    const foreignAttendant = await setup(
      handoverContext({ attendant: { ...handoverContext().attendant!, organizationId: 'org-2' } }),
    ).useCase.execute(command(), context());
    expect(foreignAttendant.success).toBe(false);

    const foreignDispenser = await setup(
      handoverContext({ dispenser: { ...handoverContext().dispenser!, stationId: 'station-2' } }),
    ).useCase.execute(command(), context());
    expect(foreignDispenser.success).toBe(false);

    const foreignReading = handoverContext();
    foreignReading.nozzleReadings[0].stationId = 'station-2';
    const readingResult = await setup(foreignReading).useCase.execute(command(), context());
    expect(readingResult.success).toBe(false);

    const foreignTerminal = handoverContext({
      terminals: [
        {
          id: 'terminal-1',
          organizationId: 'org-2',
          stationId: 'station-2',
          label: 'Foreign',
          supportsCard: true,
          supportsUpi: true,
          isActive: true,
          linkedDuId: 'du-1',
        },
      ],
    });
    const terminalResult = await setup(foreignTerminal).useCase.execute(
      {
        ...command(),
        terminalEntries: [{ terminalId: 'terminal-1', cardAmount: 10, upiAmount: 0 }],
      },
      context(),
    );
    expect(terminalResult.success).toBe(false);
  });

  it('rejects duplicate IDs, invalid readings, and unrelated terminals', async () => {
    const duplicate = await setup().useCase.execute(
      {
        ...command(),
        nozzleReadings: [command().nozzleReadings[0], command().nozzleReadings[0]],
      },
      context(),
    );
    expect(duplicate.success).toBe(false);

    const belowOpening = await setup().useCase.execute(
      {
        ...command(),
        nozzleReadings: [{ nozzleId: 'nozzle-1', closingReading: 99 }],
      },
      context(),
    );
    expect(belowOpening.success).toBe(false);

    const excessiveTesting = await setup().useCase.execute(
      {
        ...command(),
        nozzleReadings: [{ nozzleId: 'nozzle-1', closingReading: 101, testingVolume: 2 }],
      },
      context(),
    );
    expect(excessiveTesting.success).toBe(false);

    const unrelatedTerminal = await setup().useCase.execute(
      {
        ...command(),
        terminalEntries: [{ terminalId: 'other-terminal', cardAmount: 10, upiAmount: 0 }],
      },
      context(),
    );
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

  it('preserves one current declaration and one immutable event per concurrent accepted command', async () => {
    const { useCase, handovers, store } = setup();
    const firstContext = { ...context(), ids: new SequentialIdGenerator('first') };
    const secondContext = { ...context(), ids: new SequentialIdGenerator('second') };
    const [first, second] = await Promise.all([
      useCase.execute({ ...command(), cashHandedOver: 900 }, firstContext),
      useCase.execute({ ...command(), cashHandedOver: 901 }, secondContext),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(handovers.current).not.toBeNull();
    expect(store.events).toHaveLength(2);
    expect(new Set(store.events.map((event) => event.eventId)).size).toBe(2);
  });
});
