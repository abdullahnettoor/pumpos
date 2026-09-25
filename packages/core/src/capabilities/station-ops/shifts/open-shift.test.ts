import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { OpenShift } from './open-shift.js';
import type {
  NozzleReading,
  NozzleReadingRepository,
  Shift,
  ShiftRepository,
  StaffAssignmentInput,
  TerminalLinkInput,
} from './ports.js';
import type { BusinessDay, BusinessDayWriteRepository } from '../business-days/index.js';
import type { Nozzle, NozzleRepository } from '../../station-setup/nozzles/index.js';
import type { FuelPrice, FuelPriceRepository } from '../../station-setup/pricing/index.js';

class ShiftRepo implements ShiftRepository {
  readonly rows: Shift[] = [];
  readonly staff: { shiftId: string; a: StaffAssignmentInput }[] = [];
  readonly terminals: { shiftId: string; l: TerminalLinkInput }[] = [];
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findByIdWithoutLock(id: string) {
    return this.findById(id);
  }
  async save(s: Shift) {
    const i = this.rows.findIndex((r) => r.id === s.id);
    if (i >= 0) this.rows[i] = s;
    else this.rows.push(s);
  }
  async findOpenByStation(orgId: string, stationId: string) {
    return (
      this.rows.find(
        (r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN',
      ) ?? null
    );
  }
  async addStaffAssignments(shiftId: string, a: StaffAssignmentInput[]) {
    a.forEach((x) => this.staff.push({ shiftId, a: x }));
  }
  async addTerminalLinks(shiftId: string, l: TerminalLinkInput[]) {
    l.forEach((x) => this.terminals.push({ shiftId, l: x }));
  }
}

class BdRepo implements BusinessDayWriteRepository {
  readonly rows: BusinessDay[] = [];
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save(d: BusinessDay) {
    const i = this.rows.findIndex((r) => r.id === d.id);
    if (i >= 0) this.rows[i] = d;
    else this.rows.push(d);
  }
  async findOpenByStation(orgId: string, stationId: string) {
    return (
      this.rows.find(
        (r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN',
      ) ?? null
    );
  }
  async findByStationAndDate(orgId: string, stationId: string, businessDate: string) {
    return (
      this.rows.find(
        (r) =>
          r.organizationId === orgId &&
          r.stationId === stationId &&
          r.businessDate === businessDate,
      ) ?? null
    );
  }
  async lockStation() {}
  async lockById() {}
  async lockByStationAndDate() {}
}

class NozzleRepo implements NozzleRepository {
  constructor(readonly rows: Nozzle[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save() {}
  async deleteById() {
    return true;
  }
  async listByStation(orgId: string, stationId: string) {
    return this.rows.filter((r) => r.organizationId === orgId && r.stationId === stationId);
  }
}

/** The dispensers a station is currently running on. */
class InServiceDispenserRepo {
  constructor(readonly ids: string[]) {}
  async listInServiceIds() {
    return this.ids;
  }
}

/**
 * Who may be put on a dispenser. By default everybody asked about is
 * assignable; pass a list to make everyone else foreign/ineligible.
 */
class StaffDirectoryFake {
  constructor(readonly assignable?: string[]) {}
  async findAssignableUserIds(_orgId: string, _stationId: string, userIds: string[]) {
    return new Set(this.assignable ? userIds.filter((u) => this.assignable!.includes(u)) : userIds);
  }
}

class ReadingRepo implements NozzleReadingRepository {
  readonly saved: NozzleReading[] = [];
  constructor(private readonly lastClosing: Record<string, number> = {}) {}
  async lastClosingByNozzleIds(ids: string[]) {
    const m = new Map<string, number>();
    for (const id of ids) if (this.lastClosing[id] !== undefined) m.set(id, this.lastClosing[id]);
    return m;
  }
  async saveMany(r: NozzleReading[]) {
    this.saved.push(...r);
  }
  async listByShift(shiftId: string) {
    return this.saved.filter((r) => r.shiftId === shiftId);
  }
  async updateClosingMany() {}
}

class PriceRepo implements FuelPriceRepository {
  constructor(readonly rows: FuelPrice[]) {}
  async save() {}
  async listByStation() {
    return this.rows;
  }
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: null,
    actorId: 'user-1',
    correlationId: null,
    clock: new FixedClock(new Date('2026-03-15T03:00:00.000Z')),
    ids: new SequentialIdGenerator('x'),
  };
}

function nozzle(id: string, productId: string, currentReading: string): Nozzle {
  return {
    id,
    organizationId: 'org-1',
    stationId: 'st-1',
    duId: 'du-1',
    tankId: 'tk-1',
    productId,
    name: id,
    currentReading,
    createdAt: '',
    updatedAt: '',
  };
}
function price(productId: string, p: string): FuelPrice {
  return {
    id: 'p-' + productId,
    organizationId: 'org-1',
    stationId: 'st-1',
    productId,
    price: p,
    effectiveFrom: '2026-03-01',
    createdAt: '2026-03-01',
  };
}

describe('OpenShift', () => {
  it('opens a business day + shift and seeds nozzle readings from last closing', async () => {
    const shifts = new ShiftRepo();
    const businessDays = new BdRepo();
    const nozzles = new NozzleRepo([nozzle('n1', 'pet', '1000'), nozzle('n2', 'dsl', '500')]);
    const nozzleReadings = new ReadingRepo({ n1: 1200 }); // n1 has prior closing; n2 falls back to currentReading
    const fuelPrices = new PriceRepo([price('pet', '102.5'), price('dsl', '89.7')]);
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });

    const result = await new OpenShift({
      shifts,
      businessDays,
      nozzles,
      nozzleReadings,
      fuelPrices,
      // Both seeded nozzles sit on du-1, which this case runs and assigns.
      dispensers: new InServiceDispenserRepo(['du-1']),
      staff: new StaffDirectoryFake(),
      events,
    }).execute(
      {
        stationId: 'st-1',
        shiftTemplateId: 'tpl-1',
        // du-1 is in service, so it needs an attendant before the open (#258).
        staffAssignments: [{ userId: 'u-1', duId: 'du-1', openingFloat: 5000 }],
        terminalLinks: [{ terminalId: 't1', duId: 'du-1' }],
      },
      makeContext(),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shift.status).toBe('OPEN');
      expect(result.data.shift.businessDayId).toBe(result.data.businessDay.id);
    }
    expect(businessDays.rows).toHaveLength(1);
    expect(shifts.rows).toHaveLength(1);
    expect(shifts.terminals).toHaveLength(1);
    expect(nozzleReadings.saved).toHaveLength(2);
    const n1 = nozzleReadings.saved.find((r) => r.nozzleId === 'n1')!;
    const n2 = nozzleReadings.saved.find((r) => r.nozzleId === 'n2')!;
    expect(n1.openingReading).toBe('1200'); // from last closing
    expect(n1.unitPrice).toBe('102.5');
    expect(n2.openingReading).toBe('500'); // fallback to currentReading
    const types = store.events.map((e) => e.eventType);
    expect(types).toContain(BusinessEvents.BUSINESS_DAY_OPENED);
    expect(types).toContain(BusinessEvents.SHIFT_OPENED);
  });

  it("issues each Drawer's Opening Float; opening cash is their sum (ADR 0005)", async () => {
    const shifts = new ShiftRepo();
    const store = new InMemoryEventStore();
    const result = await new OpenShift({
      shifts,
      businessDays: new BdRepo(),
      nozzles: new NozzleRepo([]),
      nozzleReadings: new ReadingRepo(),
      fuelPrices: new PriceRepo([]),
      dispensers: new InServiceDispenserRepo(['du-1', 'du-2', 'du-3', 'du-4']),
      staff: new StaffDirectoryFake(),
      events: new InProcessEventDispatcher({ store }),
    }).execute(
      {
        stationId: 'st-1',
        shiftTemplateId: 'tpl-1',
        staffAssignments: [
          { userId: 'u-1', duId: 'du-1', openingFloat: 500 },
          { userId: 'u-2', duId: 'du-2', openingFloat: 1000 },
          { userId: 'u-3', duId: 'du-3', openingFloat: 0 },
          { userId: 'u-4', duId: 'du-4' },
        ],
      },
      makeContext(),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.shift.openingCash).toBe('1500');
    expect(shifts.staff.map((x) => x.a.openingFloat)).toEqual([500, 1000, 0, 0]);
    const opened = store.events.find((e) => e.eventType === BusinessEvents.SHIFT_OPENED)!;
    expect(opened.payload).toMatchObject({
      openingCash: '1500',
      openingFloats: [
        { attendantId: 'u-1', duId: 'du-1', openingFloat: 500 },
        { attendantId: 'u-2', duId: 'du-2', openingFloat: 1000 },
        { attendantId: 'u-3', duId: 'du-3', openingFloat: 0 },
        { attendantId: 'u-4', duId: 'du-4', openingFloat: 0 },
      ],
    });
  });

  it('refuses a negative Opening Float', async () => {
    const result = await new OpenShift({
      shifts: new ShiftRepo(),
      businessDays: new BdRepo(),
      nozzles: new NozzleRepo([]),
      nozzleReadings: new ReadingRepo(),
      fuelPrices: new PriceRepo([]),
      dispensers: new InServiceDispenserRepo(['du-1']),
      staff: new StaffDirectoryFake(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      {
        stationId: 'st-1',
        shiftTemplateId: 'tpl-1',
        staffAssignments: [{ userId: 'u-1', duId: 'du-1', openingFloat: -1 }],
      },
      makeContext(),
    );
    expect(result.success).toBe(false);
  });

  it('reuses an already-open business day', async () => {
    const shifts = new ShiftRepo();
    const businessDays = new BdRepo();
    const ctx = makeContext();
    businessDays.rows.push({
      id: 'bd-existing',
      organizationId: 'org-1',
      stationId: 'st-1',
      businessDate: '2026-03-15',
      status: 'OPEN',
      openedBy: 'u',
      openedAt: '',
      closedBy: null,
      closedAt: null,
      createdAt: '',
      updatedAt: '',
    });
    const result = await new OpenShift({
      shifts,
      businessDays,
      nozzles: new NozzleRepo([]),
      nozzleReadings: new ReadingRepo(),
      fuelPrices: new PriceRepo([]),
      // These cases predate the attendant rule and assign nobody, so the
      // station runs no dispensers for their purposes.
      dispensers: new InServiceDispenserRepo([]),
      staff: new StaffDirectoryFake(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ stationId: 'st-1', shiftTemplateId: 'tpl-1' }, ctx);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shift.businessDayId).toBe('bd-existing');
    expect(businessDays.rows).toHaveLength(1);
  });

  it('locks the Business Day before checking its lifecycle state', async () => {
    const calls: string[] = [];
    const shifts = new ShiftRepo();
    const originalFindOpen = shifts.findOpenByStation.bind(shifts);
    shifts.findOpenByStation = async (...args) => {
      calls.push('active-check');
      return originalFindOpen(...args);
    };
    const businessDays = new BdRepo();
    businessDays.rows.push({
      id: 'bd-existing',
      organizationId: 'org-1',
      stationId: 'st-1',
      businessDate: '2026-03-15',
      status: 'OPEN',
      openedBy: 'u',
      openedAt: '',
      closedBy: null,
      closedAt: null,
      createdAt: '',
      updatedAt: '',
    });
    const originalFind = businessDays.findByStationAndDate.bind(businessDays);
    businessDays.findByStationAndDate = async (...args) => {
      calls.push('find');
      return originalFind(...args);
    };
    businessDays.lockStation = async () => {
      calls.push('station-lock');
    };
    businessDays.lockByStationAndDate = async () => {
      calls.push('day-lock');
    };

    const result = await new OpenShift({
      shifts,
      businessDays,
      nozzles: new NozzleRepo([]),
      nozzleReadings: new ReadingRepo(),
      fuelPrices: new PriceRepo([]),
      // These cases predate the attendant rule and assign nobody, so the
      // station runs no dispensers for their purposes.
      dispensers: new InServiceDispenserRepo([]),
      staff: new StaffDirectoryFake(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ stationId: 'st-1', shiftTemplateId: 'tpl-1' }, makeContext());

    expect(result.success).toBe(true);
    expect(calls).toEqual(['station-lock', 'active-check', 'day-lock', 'find']);
  });

  it('opens a shift for a past open Business Day', async () => {
    const shifts = new ShiftRepo();
    const businessDays = new BdRepo();
    businessDays.rows.push({
      id: 'bd-past',
      organizationId: 'org-1',
      stationId: 'st-1',
      businessDate: '2026-03-14',
      status: 'OPEN',
      openedBy: 'u',
      openedAt: '',
      closedBy: null,
      closedAt: null,
      createdAt: '',
      updatedAt: '',
    });

    const result = await new OpenShift({
      shifts,
      businessDays,
      nozzles: new NozzleRepo([]),
      nozzleReadings: new ReadingRepo(),
      fuelPrices: new PriceRepo([]),
      // These cases predate the attendant rule and assign nobody, so the
      // station runs no dispensers for their purposes.
      dispensers: new InServiceDispenserRepo([]),
      staff: new StaffDirectoryFake(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', shiftTemplateId: 'tpl-1', businessDate: '2026-03-14' },
      makeContext(),
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shift.businessDayId).toBe('bd-past');
  });

  it('lazily creates a past Business Day when opening a shift', async () => {
    const shifts = new ShiftRepo();
    const businessDays = new BdRepo();

    const result = await new OpenShift({
      shifts,
      businessDays,
      nozzles: new NozzleRepo([]),
      nozzleReadings: new ReadingRepo(),
      fuelPrices: new PriceRepo([]),
      // These cases predate the attendant rule and assign nobody, so the
      // station runs no dispensers for their purposes.
      dispensers: new InServiceDispenserRepo([]),
      staff: new StaffDirectoryFake(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', shiftTemplateId: 'tpl-1', businessDate: '2026-03-14' },
      makeContext(),
    );

    expect(result.success).toBe(true);
    expect(businessDays.rows[0]?.businessDate).toBe('2026-03-14');
    expect(businessDays.rows[0]?.status).toBe('OPEN');
  });

  it('rejects opening a shift for a closed Business Day', async () => {
    const shifts = new ShiftRepo();
    const businessDays = new BdRepo();
    businessDays.rows.push({
      id: 'bd-closed',
      organizationId: 'org-1',
      stationId: 'st-1',
      businessDate: '2026-03-14',
      status: 'CLOSED',
      openedBy: 'u',
      openedAt: '',
      closedBy: 'u',
      closedAt: '',
      createdAt: '',
      updatedAt: '',
    });

    const result = await new OpenShift({
      shifts,
      businessDays,
      nozzles: new NozzleRepo([]),
      nozzleReadings: new ReadingRepo(),
      fuelPrices: new PriceRepo([]),
      // These cases predate the attendant rule and assign nobody, so the
      // station runs no dispensers for their purposes.
      dispensers: new InServiceDispenserRepo([]),
      staff: new StaffDirectoryFake(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', shiftTemplateId: 'tpl-1', businessDate: '2026-03-14' },
      makeContext(),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVARIANT_VIOLATION');
      expect(result.error.message).toContain('2026-03-14');
      expect(result.error.details).toMatchObject({
        businessDayId: 'bd-closed',
        businessDate: '2026-03-14',
        status: 'CLOSED',
      });
    }
    expect(shifts.rows).toHaveLength(0);
  });

  it('rejects a future Shift Business Date', async () => {
    const result = await new OpenShift({
      shifts: new ShiftRepo(),
      businessDays: new BdRepo(),
      nozzles: new NozzleRepo([]),
      nozzleReadings: new ReadingRepo(),
      fuelPrices: new PriceRepo([]),
      // These cases predate the attendant rule and assign nobody, so the
      // station runs no dispensers for their purposes.
      dispensers: new InServiceDispenserRepo([]),
      staff: new StaffDirectoryFake(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', shiftTemplateId: 'tpl-1', businessDate: '2026-03-16' },
      makeContext(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid calendar date', async () => {
    const result = await new OpenShift({
      shifts: new ShiftRepo(),
      businessDays: new BdRepo(),
      nozzles: new NozzleRepo([]),
      nozzleReadings: new ReadingRepo(),
      fuelPrices: new PriceRepo([]),
      // These cases predate the attendant rule and assign nobody, so the
      // station runs no dispensers for their purposes.
      dispensers: new InServiceDispenserRepo([]),
      staff: new StaffDirectoryFake(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', shiftTemplateId: 'tpl-1', businessDate: '2026-02-31' },
      makeContext(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects opening a second shift', async () => {
    const shifts = new ShiftRepo();
    shifts.rows.push({
      id: 's0',
      organizationId: 'org-1',
      stationId: 'st-1',
      businessDayId: 'bd',
      shiftTemplateId: 't',
      status: 'OPEN',
      openedBy: 'u',
      openedAt: '',
      closedBy: null,
      closedAt: null,
      lockedAt: null,
      openingCash: '0',
      closingCash: null,
      createdAt: '',
      updatedAt: '',
    });
    const result = await new OpenShift({
      shifts,
      businessDays: new BdRepo(),
      nozzles: new NozzleRepo([]),
      nozzleReadings: new ReadingRepo(),
      fuelPrices: new PriceRepo([]),
      // These cases predate the attendant rule and assign nobody, so the
      // station runs no dispensers for their purposes.
      dispensers: new InServiceDispenserRepo([]),
      staff: new StaffDirectoryFake(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ stationId: 'st-1', shiftTemplateId: 'tpl-1' }, makeContext());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONFLICT');
  });
});

/**
 * A dispenser can only be given an attendant here. Nothing writes
 * `shift_staff_assignments` afterwards, so a dispenser opened without one
 * cannot be handed over for the life of the shift and the only way out is to
 * close and re-open, discarding the opening readings (#258).
 *
 * The rule lives in the use-case rather than the form because the form is not
 * the only caller: the mobile client, a replayed offline write and any API
 * caller all reach this.
 */
describe('OpenShift attendant requirement', () => {
  const openWith = (opts: {
    inService: string[];
    staffAssignments?: { userId: string; duId: string; openingFloat?: number }[];
    nozzles?: Nozzle[];
    assignable?: string[];
  }) => {
    const readings = new ReadingRepo();
    const shifts = new ShiftRepo();
    return {
      readings,
      shifts,
      run: () =>
        new OpenShift({
          shifts,
          businessDays: new BdRepo(),
          nozzles: new NozzleRepo(opts.nozzles ?? []),
          nozzleReadings: readings,
          fuelPrices: new PriceRepo([]),
          dispensers: new InServiceDispenserRepo(opts.inService),
          staff: new StaffDirectoryFake(opts.assignable),
          events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
        }).execute(
          {
            stationId: 'st-1',
            shiftTemplateId: 'tpl-1',
            staffAssignments: opts.staffAssignments,
          },
          makeContext(),
        ),
    };
  };

  it('refuses when an in-service dispenser has nobody on it', async () => {
    const result = await openWith({
      inService: ['du-1', 'du-2'],
      staffAssignments: [{ userId: 'u-1', duId: 'du-1' }],
    }).run();

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('names the dispensers it refused for, so the caller can say which', async () => {
    const result = await openWith({ inService: ['du-1', 'du-2'], staffAssignments: [] }).run();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error.details as any)?.duIds).toEqual(['du-1', 'du-2']);
    }
  });

  it('opens when every in-service dispenser has someone', async () => {
    const result = await openWith({
      inService: ['du-1', 'du-2'],
      staffAssignments: [
        { userId: 'u-1', duId: 'du-1' },
        { userId: 'u-1', duId: 'du-2' },
      ],
    }).run();
    expect(result.success).toBe(true);
  });

  it('ignores a dispenser that is out of service', async () => {
    // The escape hatch: a pump nobody works is a pump not in use.
    const result = await openWith({
      inService: ['du-1'],
      staffAssignments: [{ userId: 'u-1', duId: 'du-1' }],
    }).run();
    expect(result.success).toBe(true);
  });

  it('opens a station that runs no dispensers at all', async () => {
    const result = await openWith({ inService: [], staffAssignments: [] }).run();
    expect(result.success).toBe(true);
  });

  it('does not seed a reading for an out-of-service dispenser’s nozzle', async () => {
    // The half that was missing: filtering the *reference* list only hid the
    // pump from the form, while the shift still grew reading rows for it —
    // which then appeared on the close screen for a pump with no attendant.
    const { readings, run } = openWith({
      inService: ['du-1'],
      staffAssignments: [{ userId: 'u-1', duId: 'du-1' }],
      nozzles: [
        { ...nozzle('n1', 'pet', '100'), duId: 'du-1' },
        { ...nozzle('n9', 'pet', '100'), duId: 'du-of-service' },
      ],
    });
    const result = await run();

    expect(result.success).toBe(true);
    expect(readings.saved.map((r) => r.nozzleId)).toEqual(['n1']);
  });
});

/**
 * The reverse of the attendant requirement (#286). An Opening Float lands in
 * Σ Opening Float and so in `expectedDrawerCash`. If it goes to a dispenser
 * nobody can hand over (out of service, unknown), or is counted twice, the shift
 * closes with a permanent shortage equal to that float.
 */
describe('OpenShift assignment validity', () => {
  const openWith = (opts: {
    inService: string[];
    staffAssignments: { userId: string; duId: string; openingFloat?: number }[];
    assignable?: string[];
  }) => {
    const shifts = new ShiftRepo();
    const run = () =>
      new OpenShift({
        shifts,
        businessDays: new BdRepo(),
        nozzles: new NozzleRepo([]),
        nozzleReadings: new ReadingRepo(),
        fuelPrices: new PriceRepo([]),
        dispensers: new InServiceDispenserRepo(opts.inService),
        staff: new StaffDirectoryFake(opts.assignable),
        events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
      }).execute(
        { stationId: 'st-1', shiftTemplateId: 'tpl-1', staffAssignments: opts.staffAssignments },
        makeContext(),
      );
    return { shifts, run };
  };

  it('refuses a float issued to an out-of-service dispenser (the ghost float)', async () => {
    const { shifts, run } = openWith({
      inService: ['du-1'],
      staffAssignments: [
        { userId: 'u-1', duId: 'du-1', openingFloat: 1000 },
        { userId: 'u-2', duId: 'du-OUT', openingFloat: 5000 },
      ],
    });
    const result = await run();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect((result.error.details as any)?.duIds).toEqual(['du-OUT']);
    }
    expect(shifts.rows).toHaveLength(0);
  });

  it('refuses a dispenser that does not exist at this station', async () => {
    const result = await openWith({
      inService: ['du-1'],
      staffAssignments: [
        { userId: 'u-1', duId: 'du-1' },
        { userId: 'u-1', duId: 'du-nope' },
      ],
    }).run();
    expect(result.success).toBe(false);
    if (!result.success) expect((result.error.details as any)?.duIds).toEqual(['du-nope']);
  });

  it('refuses the same attendant and dispenser twice', async () => {
    const result = await openWith({
      inService: ['du-1'],
      staffAssignments: [
        { userId: 'u-1', duId: 'du-1', openingFloat: 1000 },
        { userId: 'u-1', duId: 'du-1', openingFloat: 1000 },
      ],
    }).run();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect((result.error.details as any)?.duplicates).toEqual([{ userId: 'u-1', duId: 'du-1' }]);
    }
  });

  it('refuses two attendants on one dispenser — a Drawer is never shared', async () => {
    const result = await openWith({
      inService: ['du-1'],
      staffAssignments: [
        { userId: 'u-1', duId: 'du-1' },
        { userId: 'u-2', duId: 'du-1' },
      ],
    }).run();
    expect(result.success).toBe(false);
    if (!result.success) expect((result.error.details as any)?.duIds).toEqual(['du-1']);
  });

  it('refuses a user who is not assignable staff here', async () => {
    const result = await openWith({
      inService: ['du-1', 'du-2'],
      staffAssignments: [
        { userId: 'u-1', duId: 'du-1' },
        { userId: 'u-foreign', duId: 'du-2' },
      ],
      assignable: ['u-1'],
    }).run();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect((result.error.details as any)?.userIds).toEqual(['u-foreign']);
    }
  });

  it('still lets one attendant cover two pumps', async () => {
    const result = await openWith({
      inService: ['du-1', 'du-2'],
      staffAssignments: [
        { userId: 'u-1', duId: 'du-1', openingFloat: 500 },
        { userId: 'u-1', duId: 'du-2', openingFloat: 500 },
      ],
      assignable: ['u-1'],
    }).run();
    expect(result.success).toBe(true);
  });
});
