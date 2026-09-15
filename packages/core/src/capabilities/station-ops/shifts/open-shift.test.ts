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
  async updateClosing() {}
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
      events,
    }).execute(
      {
        stationId: 'st-1',
        shiftTemplateId: 'tpl-1',
        openingCash: 5000,
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
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ stationId: 'st-1', shiftTemplateId: 'tpl-1', openingCash: 0 }, ctx);
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
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ stationId: 'st-1', shiftTemplateId: 'tpl-1', openingCash: 0 }, makeContext());

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
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', shiftTemplateId: 'tpl-1', openingCash: 0, businessDate: '2026-03-14' },
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
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', shiftTemplateId: 'tpl-1', openingCash: 0, businessDate: '2026-03-14' },
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
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', shiftTemplateId: 'tpl-1', openingCash: 0, businessDate: '2026-03-14' },
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
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', shiftTemplateId: 'tpl-1', openingCash: 0, businessDate: '2026-03-16' },
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
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', shiftTemplateId: 'tpl-1', openingCash: 0, businessDate: '2026-02-31' },
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
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ stationId: 'st-1', shiftTemplateId: 'tpl-1', openingCash: 0 }, makeContext());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONFLICT');
  });
});
