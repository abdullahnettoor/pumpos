import { describe, expect, it } from 'vite-plus/test';
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
    return this.rows.some(
      (r) => r.organizationId === orgId && r.code === code && r.id !== excludeId,
    );
  }
  async listByOrganization(orgId: string) {
    return this.rows.filter((r) => r.organizationId === orgId);
  }
  async listCategories(orgId: string, excludeProductId?: string): Promise<string[]> {
    const set = new Set<string>();
    for (const r of this.rows) {
      if (r.organizationId === orgId && r.id !== excludeProductId && r.category) {
        set.add(r.category);
      }
    }
    return Array.from(set).sort();
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
    const useCase = new CreateProduct({
      repository: repo,
      events: new InProcessEventDispatcher({ store }),
    });

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
    const useCase = new CreateProduct({
      repository: repo,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    });
    const result = await useCase.execute(
      { name: 'Servo 20W40', code: 'LUB-2040', productType: 'LUBRICANT', unit: 'pc' },
      makeContext(),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.inventoryType).toBe('ITEM');
  });

  it('rejects a duplicate code', async () => {
    const repo = new InMemoryProductRepo();
    const useCase = new CreateProduct({
      repository: repo,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    });
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
      save: async (m: any) => {
        movements.push(m);
      },
      saveMany: async () => {},
      currentQuantityForTank: async () => 0,
      currentQuantityForProduct: async () => 0,
    };
    const businessDays: any = {
      findById: async () => null,
      save: async () => {},
      findOpenByStation: async () => null,
      // Pretend a day already exists so ensureBusinessDayForDate returns it.
      findByStationAndDate: async () => ({
        id: 'bd-1',
        organizationId: 'org-1',
        stationId: 'st-1',
        businessDate: '2026-01-01',
        status: 'OPEN',
        openedBy: 'u',
        openedAt: '',
        closedBy: null,
        closedAt: null,
        createdAt: '',
        updatedAt: '',
      }),
      lockStation: async () => {},
      lockById: async () => {},
      lockByStationAndDate: async () => {},
    };
    const useCase = new CreateProduct({
      repository: repo,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
      stock,
      businessDays,
    });
    const result = await useCase.execute(
      {
        name: 'Engine Oil',
        code: 'LUB-EO',
        productType: 'LUBRICANT',
        unit: 'pc',
        openingStock: 20,
        stationId: 'st-1',
      },
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
    const stock: any = {
      save: async (m: any) => {
        movements.push(m);
      },
      saveMany: async () => {},
      currentQuantityForTank: async () => 0,
      currentQuantityForProduct: async () => 0,
    };
    const businessDays: any = {
      findById: async () => null,
      save: async () => {},
      findOpenByStation: async () => null,
      findByStationAndDate: async () => ({
        id: 'bd-1',
        organizationId: 'org-1',
        stationId: 'st-1',
        businessDate: '2026-01-01',
        status: 'OPEN',
        openedBy: 'u',
        openedAt: '',
        closedBy: null,
        closedAt: null,
        createdAt: '',
        updatedAt: '',
      }),
      lockStation: async () => {},
      lockById: async () => {},
      lockByStationAndDate: async () => {},
    };
    const useCase = new CreateProduct({
      repository: repo,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
      stock,
      businessDays,
    });
    const result = await useCase.execute(
      {
        name: 'Petrol',
        code: 'FUEL-MS',
        productType: 'FUEL',
        unit: 'L',
        openingStock: 5000,
        stationId: 'st-1',
      },
      makeContext(),
    );
    expect(result.success).toBe(true);
    expect(movements).toHaveLength(0); // fuel opening stock is seeded via tanks, not here
  });

  it('canonicalises category: reuses existing spelling ignoring case', async () => {
    const repo = new InMemoryProductRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();
    await new CreateProduct({ repository: repo, events }).execute(
      { name: 'Engine Oil 5W30', code: 'OIL-1', productType: 'LUBRICANT', unit: 'L', category: 'Engine Oil' },
      ctx,
    );

    const result = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'Engine Oil 10W40', code: 'OIL-2', productType: 'LUBRICANT', unit: 'L', category: 'engine oil' },
      ctx,
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe('Engine Oil');
  });

  it('stores a new category trimmed, as typed', async () => {
    const repo = new InMemoryProductRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();
    const result = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'Coolant Green', code: 'COOL-1', productType: 'LUBRICANT', unit: 'L', category: '  Coolant  ' },
      ctx,
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe('Coolant');
  });

  it('converts blank or whitespace category to null', async () => {
    const repo = new InMemoryProductRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();
    const result = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'Grease', code: 'GR-1', productType: 'LUBRICANT', unit: 'kg', category: '   ' },
      ctx,
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBeNull();
  });

  it('ignores categories from other organizations', async () => {
    const repo = new InMemoryProductRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctxOrg1 = makeContext();
    const ctxOrg2: ExecutionContext = { ...makeContext(), organizationId: 'org-2' };

    await new CreateProduct({ repository: repo, events }).execute(
      { name: 'Grease Org2', code: 'GR-2', productType: 'LUBRICANT', unit: 'kg', category: 'Heavy Grease' },
      ctxOrg2,
    );

    const result = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'Grease Org1', code: 'GR-1', productType: 'LUBRICANT', unit: 'kg', category: 'heavy grease' },
      ctxOrg1,
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe('heavy grease');
  });

  it('import path: 3 sequential creates with different cases resolve to the first spelling', async () => {
    const repo = new InMemoryProductRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();

    const r1 = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'P1', code: 'P1', productType: 'LUBRICANT', unit: 'L', category: 'engine oil' },
      ctx,
    );
    const r2 = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'P2', code: 'P2', productType: 'LUBRICANT', unit: 'L', category: 'ENGINE OIL' },
      ctx,
    );
    const r3 = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'P3', code: 'P3', productType: 'LUBRICANT', unit: 'L', category: 'Engine Oil' },
      ctx,
    );

    expect(r1.success && r2.success && r3.success).toBe(true);
    if (r1.success && r2.success && r3.success) {
      expect(r1.data.category).toBe('engine oil');
      expect(r2.data.category).toBe('engine oil');
      expect(r3.data.category).toBe('engine oil');
    }
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

    const result = await new UpdateProduct({ repository: repo, events }).execute(
      { id, isActive: false },
      ctx,
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(false);
    expect(store.events.some((e) => e.eventType === BusinessEvents.PRODUCT_UPDATED)).toBe(true);
  });

  it('canonicalises category to existing spelling when another product holds it', async () => {
    const repo = new InMemoryProductRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();
    await new CreateProduct({ repository: repo, events }).execute(
      { name: 'P1', code: 'P1', productType: 'LUBRICANT', unit: 'L', category: 'Engine Oil' },
      ctx,
    );
    const p2 = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'P2', code: 'P2', productType: 'LUBRICANT', unit: 'L', category: 'Coolant' },
      ctx,
    );
    const p2Id = p2.success ? p2.data.id : '';

    const result = await new UpdateProduct({ repository: repo, events }).execute(
      { id: p2Id, category: 'engine oil' },
      ctx,
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe('Engine Oil');
  });

  it('allows a product that is the sole holder of a spelling to re-case itself', async () => {
    const repo = new InMemoryProductRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();
    const p1 = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'P1', code: 'P1', productType: 'LUBRICANT', unit: 'L', category: 'Engine Oil' },
      ctx,
    );
    const p1Id = p1.success ? p1.data.id : '';

    const result = await new UpdateProduct({ repository: repo, events }).execute(
      { id: p1Id, category: 'engine oil' },
      ctx,
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe('engine oil');
  });

  it('clears category when updated with null or blank string', async () => {
    const repo = new InMemoryProductRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();
    const p1 = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'P1', code: 'P1', productType: 'LUBRICANT', unit: 'L', category: 'Engine Oil' },
      ctx,
    );
    const p1Id = p1.success ? p1.data.id : '';

    const resNull = await new UpdateProduct({ repository: repo, events }).execute(
      { id: p1Id, category: null },
      ctx,
    );
    expect(resNull.success).toBe(true);
    if (resNull.success) expect(resNull.data.category).toBeNull();

    // Reset to category
    await new UpdateProduct({ repository: repo, events }).execute(
      { id: p1Id, category: 'Engine Oil' },
      ctx,
    );

    const resBlank = await new UpdateProduct({ repository: repo, events }).execute(
      { id: p1Id, category: '   ' },
      ctx,
    );
    expect(resBlank.success).toBe(true);
    if (resBlank.success) expect(resBlank.data.category).toBeNull();
  });

  it('leaves category untouched when omitted (undefined)', async () => {
    const repo = new InMemoryProductRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();
    const p1 = await new CreateProduct({ repository: repo, events }).execute(
      { name: 'P1', code: 'P1', productType: 'LUBRICANT', unit: 'L', category: 'Engine Oil' },
      ctx,
    );
    const p1Id = p1.success ? p1.data.id : '';

    const result = await new UpdateProduct({ repository: repo, events }).execute(
      { id: p1Id, name: 'P1 Renamed' },
      ctx,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('P1 Renamed');
      expect(result.data.category).toBe('Engine Oil');
    }
  });
});

describe('ProductRepository.listCategories', () => {
  it('returns distinct non-null categories scoped to organization including archived products', async () => {
    const repo = new InMemoryProductRepo();
    await repo.save({
      id: 'p1',
      organizationId: 'org-1',
      name: 'P1',
      code: 'C1',
      productType: 'LUBRICANT',
      inventoryType: 'ITEM',
      stockTracked: true,
      isTaxable: true,
      taxCategory: 'GST',
      unit: 'L',
      brand: null,
      category: 'Engine Oil',
      sellingPrice: null,
      costBasis: null,
      taxConfig: {},
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await repo.save({
      id: 'p2',
      organizationId: 'org-1',
      name: 'P2',
      code: 'C2',
      productType: 'LUBRICANT',
      inventoryType: 'ITEM',
      stockTracked: true,
      isTaxable: true,
      taxCategory: 'GST',
      unit: 'L',
      brand: null,
      category: 'Coolant',
      sellingPrice: null,
      costBasis: null,
      taxConfig: {},
      isActive: false, // archived product
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await repo.save({
      id: 'p3',
      organizationId: 'org-1',
      name: 'P3',
      code: 'C3',
      productType: 'LUBRICANT',
      inventoryType: 'ITEM',
      stockTracked: true,
      isTaxable: true,
      taxCategory: 'GST',
      unit: 'L',
      brand: null,
      category: null, // null category ignored
      sellingPrice: null,
      costBasis: null,
      taxConfig: {},
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await repo.save({
      id: 'p4',
      organizationId: 'org-2', // other org ignored
      name: 'P4',
      code: 'C4',
      productType: 'LUBRICANT',
      inventoryType: 'ITEM',
      stockTracked: true,
      isTaxable: true,
      taxCategory: 'GST',
      unit: 'L',
      brand: null,
      category: 'Grease',
      sellingPrice: null,
      costBasis: null,
      taxConfig: {},
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const categories = await repo.listCategories('org-1');
    expect(categories).toEqual(['Coolant', 'Engine Oil']);
  });
});
