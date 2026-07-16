import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { CreateProduct } from './create-product.js';
import { UpdateProduct } from './update-product.js';
import type { Product, ProductRepository } from './ports.js';

class InMemoryProductRepo implements ProductRepository {
  readonly rows: Product[] = [];
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save(p: Product) {
    const idx = this.rows.findIndex((r) => r.id === p.id);
    if (idx >= 0) this.rows[idx] = p;
    else this.rows.push(p);
  }
  async existsByCode(orgId: string, code: string, excludeId?: string) {
    return this.rows.some((r) => r.organizationId === orgId && r.code === code && r.id !== excludeId);
  }
  async listByOrganization(orgId: string) {
    return this.rows.filter((r) => r.organizationId === orgId);
  }
  async updateCostBasis(productId: string, costBasis: string) {
    const r = this.rows.find((x) => x.id === productId);
    if (r) r.costBasis = costBasis;
  }
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: null,
    businessDayId: null,
    actorId: 'user-1',
    correlationId: null,
    clock: new FixedClock(new Date('2026-01-01T00:00:00.000Z')),
    ids: new SequentialIdGenerator('prod'),
  };
}

describe('CreateProduct', () => {
  it('defaults inventoryType=BULK and isTaxable=false for FUEL', async () => {
    const repo = new InMemoryProductRepo();
    const store = new InMemoryEventStore();
    const useCase = new CreateProduct({ repository: repo, events: new InProcessEventDispatcher({ store }) });

    const result = await useCase.execute(
      { name: 'Petrol XP95', code: 'FUEL-PET', productType: 'FUEL', unit: 'L' },
      makeContext(),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inventoryType).toBe('BULK');
      expect(result.data.isTaxable).toBe(false);
    }
    expect(store.events[0].eventType).toBe(BusinessEvents.PRODUCT_CREATED);
  });

  it('defaults inventoryType=ITEM for merchandise', async () => {
    const repo = new InMemoryProductRepo();
    const useCase = new CreateProduct({ repository: repo, events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }) });
    const result = await useCase.execute(
      { name: 'Servo 20W40', code: 'LUB-2040', productType: 'LUBRICANT', unit: 'pc' },
      makeContext(),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.inventoryType).toBe('ITEM');
  });

  it('rejects a duplicate code', async () => {
    const repo = new InMemoryProductRepo();
    const useCase = new CreateProduct({ repository: repo, events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }) });
    const ctx = makeContext();
    const cmd = { name: 'Diesel', code: 'FUEL-DSL', productType: 'FUEL' as const, unit: 'L' };
    await useCase.execute(cmd, ctx);
    const second = await useCase.execute(cmd, ctx);
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.code).toBe('CONFLICT');
  });

  it('posts an OpeningBalance movement for merchandise when opening stock is provided', async () => {
    const repo = new InMemoryProductRepo();
    const movements: any[] = [];
    const stock: any = {
      save: async (m: any) => { movements.push(m); },
      saveMany: async () => {},
      currentQuantityForTank: async () => 0,
      currentQuantityForProduct: async () => 0,
    };
    const businessDays: any = {
      findById: async () => null,
      save: async () => {},
      findOpenByStation: async () => null,
      // Pretend a day already exists so ensureBusinessDayForDate returns it.
      findByStationAndDate: async () => ({ id: 'bd-1', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-01-01', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, createdAt: '', updatedAt: '' }),
    };
    const useCase = new CreateProduct({ repository: repo, events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }), stock, businessDays });
    const result = await useCase.execute(
      { name: 'Engine Oil', code: 'LUB-EO', productType: 'LUBRICANT', unit: 'pc', openingStock: 20, stationId: 'st-1' },
      makeContext(),
    );
    expect(result.success).toBe(true);
    expect(movements).toHaveLength(1);
    expect(movements[0].movementType).toBe('OpeningBalance');
    expect(movements[0].quantity).toBe('20');
    expect(movements[0].tankId).toBeNull();
    expect(movements[0].businessDayId).toBe('bd-1');
  });

  it('does not post opening stock for fuel products', async () => {
    const repo = new InMemoryProductRepo();
    const movements: any[] = [];
    const stock: any = { save: async (m: any) => { movements.push(m); }, saveMany: async () => {}, currentQuantityForTank: async () => 0, currentQuantityForProduct: async () => 0 };
    const businessDays: any = { findById: async () => null, save: async () => {}, findOpenByStation: async () => null, findByStationAndDate: async () => ({ id: 'bd-1', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-01-01', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, createdAt: '', updatedAt: '' }) };
    const useCase = new CreateProduct({ repository: repo, events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }), stock, businessDays });
    const result = await useCase.execute(
      { name: 'Petrol', code: 'FUEL-MS', productType: 'FUEL', unit: 'L', openingStock: 5000, stationId: 'st-1' },
      makeContext(),
    );
    expect(result.success).toBe(true);
    expect(movements).toHaveLength(0); // fuel opening stock is seeded via tanks, not here
  });
});

describe('UpdateProduct', () => {
  it('archives a product via isActive=false and emits PRODUCT_UPDATED', async () => {
    const repo = new InMemoryProductRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const ctx = makeContext();
    const created = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'Coolant', code: 'LUB-COOL', productType: 'LUBRICANT', unit: 'pc' },
      ctx,
    );
    const id = created.success ? created.data.id : '';

    const result = await new UpdateProduct({ repository: repo, events }).execute({ id, isActive: false }, ctx);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(false);
    expect(store.events.some((e) => e.eventType === BusinessEvents.PRODUCT_UPDATED)).toBe(true);
  });
});
