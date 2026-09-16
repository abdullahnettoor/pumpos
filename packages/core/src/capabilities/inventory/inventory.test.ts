import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../kernel/index.js';
import type { ExecutionContext } from '../../kernel/index.js';
import { RecordInventoryAdjustment } from './record-adjustment.js';
import { RecordStockCount } from './record-stock-count.js';
import type {
  StockMovement,
  StockMovementRepository,
  StockVariance,
  StockVarianceRepository,
} from './ports.js';
import type {
  BusinessDay,
  BusinessDayWriteRepository,
} from '../station-ops/business-days/index.js';
import type { Tank, TankRepository } from '../station-setup/tanks/index.js';
import type { Shift, ShiftRepository } from '../station-ops/shifts/index.js';

class MovementRepo implements StockMovementRepository {
  readonly rows: StockMovement[] = [];
  constructor(
    private readonly tankQty: Record<string, number> = {},
    private readonly productQty: Record<string, number> = {},
  ) {}
  async save(m: StockMovement) {
    this.rows.push(m);
  }
  async saveMany(m: StockMovement[]) {
    this.rows.push(...m);
  }
  async currentQuantityForTank(tankId: string) {
    return this.tankQty[tankId] ?? 0;
  }
  async currentQuantityForProduct(_org: string, productId: string) {
    return this.productQty[productId] ?? 0;
  }
}
class VarianceRepo implements StockVarianceRepository {
  readonly rows: StockVariance[] = [];
  async save(v: StockVariance) {
    this.rows.push(v);
  }
  async existsForShift(shiftId: string) {
    return this.rows.some((row) => row.shiftId === shiftId);
  }
}
class TankRepo implements TankRepository {
  constructor(readonly rows: Tank[]) {}
  async findById(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async findByIdForUpdate(id: string) {
    return this.findById(id);
  }
  async hasNozzles() {
    return false;
  }
  async save() {}
  async deactivateById() {
    return false;
  }
  async listByStation(orgId: string, stationId: string) {
    return this.rows.filter((row) => row.organizationId === orgId && row.stationId === stationId);
  }
}
class ShiftRepo implements ShiftRepository {
  constructor(readonly rows: Shift[] = []) {}
  async findById(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async findByIdWithoutLock(id: string) {
    return this.findById(id);
  }
  async save() {}
  async findOpenByStation(orgId: string, stationId: string) {
    return (
      this.rows.find(
        (row) =>
          row.organizationId === orgId && row.stationId === stationId && row.status === 'OPEN',
      ) ?? null
    );
  }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}
class BdRepo implements BusinessDayWriteRepository {
  requestedDate: string | null = null;
  constructor(readonly rows: BusinessDay[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save() {}
  async findOpenByStation(orgId: string, stationId: string) {
    return (
      this.rows.find(
        (r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN',
      ) ?? null
    );
  }
  async findByStationAndDate(orgId: string, stationId: string, date: string) {
    this.requestedDate = date;
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId) ?? null;
  }
  async lockStation() {}
  async lockById() {}
  async lockByStationAndDate() {}
}

function ctx(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: null,
    actorId: 'u',
    correlationId: null,
    clock: new FixedClock(new Date('2026-03-15T10:00:00Z')),
    ids: new SequentialIdGenerator('i'),
  };
}
function bday(): BusinessDay {
  return {
    id: 'bd-1',
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
  };
}
function tank(overrides: Partial<Tank> = {}): Tank {
  return {
    id: 'tank-A',
    organizationId: 'org-1',
    stationId: 'st-1',
    name: 'MS Tank',
    productId: 'pet',
    capacity: '10000',
    status: 'ACTIVE',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}
function closedShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'sh-1',
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: 'bd-1',
    shiftTemplateId: 'template-1',
    status: 'CLOSED',
    openedBy: 'u',
    openedAt: '',
    closedBy: 'u',
    closedAt: '',
    lockedAt: null,
    openingCash: '0',
    closingCash: '0',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function stockCountDeps(
  movements = new MovementRepo({ 'tank-A': 5000 }),
  tanks = new TankRepo([tank()]),
  shifts = new ShiftRepo(),
) {
  const variances = new VarianceRepo();
  const store = new InMemoryEventStore();
  return {
    deps: {
      movements,
      variances,
      tanks,
      shifts,
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store }),
    },
    movements,
    variances,
    store,
  };
}

describe('RecordInventoryAdjustment', () => {
  it('posts an Adjustment movement and emits INVENTORY_ADJUSTED', async () => {
    const movements = new MovementRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordInventoryAdjustment({
      movements,
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store }),
    }).execute({ stationId: 'st-1', productId: 'oil', quantity: -3, reason: 'breakage' }, ctx());
    expect(result.success).toBe(true);
    expect(movements.rows[0].movementType).toBe('Adjustment');
    expect(movements.rows[0].quantity).toBe('-3');
    expect(store.events[0].eventType).toBe(BusinessEvents.INVENTORY_ADJUSTED);
  });
});

describe('RecordStockCount', () => {
  it('rejects a stock count on a closed Business Day before writing a variance', async () => {
    const { deps, movements, variances, store } = stockCountDeps();
    deps.businessDays = new BdRepo([
      { ...bday(), status: 'CLOSED', closedAt: '2026-03-15T09:00:00Z' },
    ]);

    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', actualQuantity: 4950 },
      ctx(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
    expect(variances.rows).toHaveLength(0);
    expect(movements.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('bulk dip below book posts negative variance + Variance movement + TANK_DIP + VARIANCE events', async () => {
    const { deps, movements, variances, store } = stockCountDeps(
      undefined,
      undefined,
      new ShiftRepo([closedShift()]),
    );
    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', actualQuantity: 4950, shiftId: 'sh-1' },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expectedQuantity).toBe(5000);
      expect(result.data.varianceQuantity).toBe(-50);
    }
    expect(variances.rows).toHaveLength(1);
    expect(variances.rows[0]).toMatchObject({
      productId: 'pet',
      shiftId: 'sh-1',
      businessDayId: 'bd-1',
    });
    const varMove = movements.rows.find((m) => m.movementType === 'Variance');
    expect(varMove?.quantity).toBe('-50');
    const types = store.events.map((e) => e.eventType);
    expect(types).toContain(BusinessEvents.TANK_DIP_RECORDED);
    expect(types).toContain(BusinessEvents.VARIANCE_RECORDED);
    expect(store.events[0].metadata).toMatchObject({ grouping: { role: 'primary' } });
    expect(store.events[1].metadata).toMatchObject({ grouping: { role: 'related' } });
  });

  it('item count matching book records zero variance and no Variance movement', async () => {
    const movements = new MovementRepo({}, { oil: 20 });
    const variances = new VarianceRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordStockCount({
      movements,
      variances,
      tanks: new TankRepo([]),
      shifts: new ShiftRepo(),
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store }),
    }).execute({ stationId: 'st-1', productId: 'oil', actualQuantity: 20 }, ctx());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.varianceQuantity).toBe(0);
    expect(movements.rows.some((m) => m.movementType === 'Variance')).toBe(false);
    const types = store.events.map((e) => e.eventType);
    expect(types).toContain(BusinessEvents.PHYSICAL_COUNT_COMPLETED);
    expect(types).not.toContain(BusinessEvents.VARIANCE_RECORDED);
  });

  it.each([
    null,
    tank({ organizationId: 'other-org' }),
    tank({ stationId: 'other-station' }),
    tank({ status: 'INACTIVE' }),
  ])('hides unknown and out-of-scope Tanks', async (invalidTank) => {
    const { deps } = stockCountDeps(undefined, new TankRepo(invalidTank ? [invalidTank] : []));
    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', actualQuantity: 4950 },
      ctx(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects Shift attribution outside the Tank Dip Station', async () => {
    const { deps } = stockCountDeps(
      undefined,
      undefined,
      new ShiftRepo([closedShift({ stationId: 'other-station' })]),
    );
    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', actualQuantity: 4950, shiftId: 'sh-1' },
      ctx(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('records valid closed-Shift attribution', async () => {
    const { deps, variances } = stockCountDeps(
      undefined,
      undefined,
      new ShiftRepo([closedShift()]),
    );
    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', actualQuantity: 5000, shiftId: 'sh-1' },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(variances.rows[0].shiftId).toBe('sh-1');
  });

  it('uses the attributed closed Shift Business Day when a retry crosses the day boundary', async () => {
    const oldDay = bday();
    const currentDay = { ...bday(), id: 'bd-2', businessDate: '2026-03-16' };
    const { deps, variances } = stockCountDeps(
      undefined,
      undefined,
      new ShiftRepo([closedShift()]),
    );
    deps.businessDays = new BdRepo([oldDay, currentDay]);
    const retryContext = { ...ctx(), clock: new FixedClock(new Date('2026-03-16T10:00:00Z')) };

    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', shiftId: 'sh-1', tankId: 'tank-A', actualQuantity: 5000 },
      retryContext,
    );

    expect(result.success).toBe(true);
    expect(variances.rows[0].businessDayId).toBe('bd-1');
  });

  it('records a mid-shift Tank Dip with variance but WITHOUT reconciling book stock', async () => {
    const movements = new MovementRepo({ 'tank-A': 5000 });
    const { deps, variances, store } = stockCountDeps(
      movements,
      undefined,
      new ShiftRepo([closedShift({ status: 'OPEN', closedAt: null, closedBy: null })]),
    );
    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', actualQuantity: 4950 },
      ctx(),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.openShiftAtRecording).toBe(true);
    expect(result.data.varianceQuantity).toBe(-50);
    // Variance snapshot recorded, flagged...
    expect(variances.rows).toHaveLength(1);
    expect(variances.rows[0].metadata).toEqual({ openShiftAtRecording: true });
    // ...but no reconciliation movement while in-flight sales are un-booked.
    expect(movements.rows).toHaveLength(0);
    const dip = store.events.find((e) => e.eventType === BusinessEvents.TANK_DIP_RECORDED);
    expect((dip?.payload as any)?.openShiftAtRecording).toBe(true);
  });

  it('allows attribution to an OPEN shift', async () => {
    const openShift = closedShift({ status: 'OPEN', closedAt: null, closedBy: null });
    const { deps, variances } = stockCountDeps(undefined, undefined, new ShiftRepo([openShift]));
    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', actualQuantity: 5000, shiftId: 'sh-1' },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(variances.rows[0].shiftId).toBe('sh-1');
  });

  it('reconciles book stock for a between-shift dip (no open shift)', async () => {
    const movements = new MovementRepo({ 'tank-A': 5000 });
    const { deps, variances } = stockCountDeps(
      movements,
      undefined,
      new ShiftRepo([closedShift()]),
    );
    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', actualQuantity: 4950 },
      ctx(),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.openShiftAtRecording).toBe(false);
    expect(variances.rows[0].metadata).toEqual({});
    expect(movements.rows).toHaveLength(1);
    expect(movements.rows[0].movementType).toBe('Variance');
  });

  it('rejects a caller-supplied Product for a Tank Dip', async () => {
    const { deps } = stockCountDeps();
    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', productId: 'other-product', actualQuantity: 4950 },
      ctx(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('records a zero-Variance Tank Dip without a Stock Movement', async () => {
    const { deps, movements, variances, store } = stockCountDeps();
    const result = await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', actualQuantity: 5000 },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(variances.rows).toHaveLength(1);
    expect(movements.rows).toHaveLength(0);
    expect(store.events.map((event) => event.eventType)).toEqual([
      BusinessEvents.TANK_DIP_RECORDED,
    ]);
  });

  it('records a positive Tank Dip Variance and preserves its reason', async () => {
    const { deps, movements, variances } = stockCountDeps();
    const result = await new RecordStockCount(deps).execute(
      {
        stationId: 'st-1',
        tankId: 'tank-A',
        actualQuantity: 5025,
        reason: 'Delivery meter difference',
      },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(variances.rows[0]).toMatchObject({
      varianceQuantity: '25',
      reason: 'Delivery meter difference',
      shiftId: null,
    });
    expect(movements.rows[0]).toMatchObject({ quantity: '25', notes: 'Delivery meter difference' });
  });

  it('rejects a Station outside the execution context', async () => {
    const { deps } = stockCountDeps();
    const result = await new RecordStockCount(deps).execute(
      { stationId: 'other-station', tankId: 'tank-A', actualQuantity: 5000 },
      ctx(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('resolves the Business Day using the Station clock boundary', async () => {
    const businessDays = new BdRepo([bday()]);
    const { deps } = stockCountDeps();
    deps.businessDays = businessDays;
    const stationContext = {
      ...ctx(),
      clock: new FixedClock(new Date('2026-03-15T00:00:00Z')),
      timeZone: 'Asia/Kolkata',
      businessDayStartsAt: '06:00',
    };

    await new RecordStockCount(deps).execute(
      { stationId: 'st-1', tankId: 'tank-A', actualQuantity: 5000 },
      stationContext,
    );

    expect(businessDays.requestedDate).toBe('2026-03-14');
  });
});
