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
import type { StockMovement, StockMovementRepository, StockVariance, StockVarianceRepository } from './ports.js';
import type { BusinessDay, BusinessDayRepository } from '../station-ops/business-days/index.js';

class MovementRepo implements StockMovementRepository {
  readonly rows: StockMovement[] = [];
  constructor(private readonly tankQty: Record<string, number> = {}, private readonly productQty: Record<string, number> = {}) {}
  async save(m: StockMovement) { this.rows.push(m); }
  async saveMany(m: StockMovement[]) { this.rows.push(...m); }
  async currentQuantityForTank(tankId: string) { return this.tankQty[tankId] ?? 0; }
  async currentQuantityForProduct(_org: string, productId: string) { return this.productQty[productId] ?? 0; }
}
class VarianceRepo implements StockVarianceRepository {
  readonly rows: StockVariance[] = [];
  async save(v: StockVariance) { this.rows.push(v); }
}
class BdRepo implements BusinessDayRepository {
  constructor(readonly rows: BusinessDay[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async findOpenByStation(orgId: string, stationId: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN') ?? null;
  }
}

function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: null, actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('i') };
}
function bday(): BusinessDay {
  return { id: 'bd-1', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-15', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, createdAt: '', updatedAt: '' };
}

describe('RecordInventoryAdjustment', () => {
  it('posts an Adjustment movement and emits INVENTORY_ADJUSTED', async () => {
    const movements = new MovementRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordInventoryAdjustment({ movements, businessDays: new BdRepo([bday()]), events: new InProcessEventDispatcher({ store }) })
      .execute({ stationId: 'st-1', productId: 'oil', quantity: -3, reason: 'breakage' }, ctx());
    expect(result.success).toBe(true);
    expect(movements.rows[0].movementType).toBe('Adjustment');
    expect(movements.rows[0].quantity).toBe('-3');
    expect(store.events[0].eventType).toBe(BusinessEvents.INVENTORY_ADJUSTED);
  });
});

describe('RecordStockCount', () => {
  it('bulk dip below book posts negative variance + Variance movement + TANK_DIP + VARIANCE events', async () => {
    const movements = new MovementRepo({ 'tank-A': 5000 });
    const variances = new VarianceRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordStockCount({ movements, variances, businessDays: new BdRepo([bday()]), events: new InProcessEventDispatcher({ store }) })
      .execute({ stationId: 'st-1', productId: 'pet', tankId: 'tank-A', actualQuantity: 4950 }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expectedQuantity).toBe(5000);
      expect(result.data.varianceQuantity).toBe(-50);
    }
    expect(variances.rows).toHaveLength(1);
    const varMove = movements.rows.find((m) => m.movementType === 'Variance');
    expect(varMove?.quantity).toBe('-50');
    const types = store.events.map((e) => e.eventType);
    expect(types).toContain(BusinessEvents.TANK_DIP_RECORDED);
    expect(types).toContain(BusinessEvents.VARIANCE_RECORDED);
  });

  it('item count matching book records zero variance and no Variance movement', async () => {
    const movements = new MovementRepo({}, { oil: 20 });
    const variances = new VarianceRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordStockCount({ movements, variances, businessDays: new BdRepo([bday()]), events: new InProcessEventDispatcher({ store }) })
      .execute({ stationId: 'st-1', productId: 'oil', actualQuantity: 20 }, ctx());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.varianceQuantity).toBe(0);
    expect(movements.rows.some((m) => m.movementType === 'Variance')).toBe(false);
    const types = store.events.map((e) => e.eventType);
    expect(types).toContain(BusinessEvents.PHYSICAL_COUNT_COMPLETED);
    expect(types).not.toContain(BusinessEvents.VARIANCE_RECORDED);
  });
});
