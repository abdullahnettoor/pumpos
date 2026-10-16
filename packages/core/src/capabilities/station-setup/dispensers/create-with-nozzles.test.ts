import { describe, expect, it } from 'vitest';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import type { Tank, TankRepository } from '../tanks/index.js';
import { CreateNozzle, type Nozzle, type NozzleRepository } from '../nozzles/index.js';
import type { Product } from '../products/index.js';
import type { DispenserRepository, DispenserUnit } from './index.js';
import { CreateDispenserWithNozzles, MAX_NOZZLES_PER_DISPENSER } from './create-with-nozzles.js';

const STATION = 'station-1';
const MS = 'product-ms';
const HSD = 'product-hsd';

class Rows<T extends { id: string; organizationId: string; stationId: string }> {
  readonly rows: T[] = [];
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save(row: T) {
    const idx = this.rows.findIndex((r) => r.id === row.id);
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
  }
  async deleteById(id: string) {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx >= 0) this.rows.splice(idx, 1);
    return idx >= 0;
  }
  async listByStation(organizationId: string, stationId: string) {
    return this.rows.filter(
      (r) => r.organizationId === organizationId && r.stationId === stationId,
    );
  }
}

class InMemoryDispensers extends Rows<DispenserUnit> implements DispenserRepository {}
class InMemoryNozzles extends Rows<Nozzle> implements NozzleRepository {}
class InMemoryTanks extends Rows<Tank> implements TankRepository {
  async findByIdForUpdate(id: string) {
    return this.findById(id);
  }
  async hasNozzles() {
    return false;
  }
  async deactivateById() {
    return false;
  }
}

function tank(id: string, productId: string, overrides: Partial<Tank> = {}): Tank {
  return {
    id,
    organizationId: 'org-1',
    stationId: STATION,
    name: id,
    productId,
    capacity: '20000',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function fuel(id: string, organizationId = 'org-1'): Product {
  return {
    id,
    organizationId,
    name: id,
    code: id,
    productType: 'FUEL',
    inventoryType: 'BULK',
    stockTracked: true,
    isTaxable: true,
    taxCategory: 'FUEL_VAT',
    unit: 'L',
    brand: null,
    category: null,
    sellingPrice: null,
    costBasis: null,
    taxConfig: {},
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

class InMemoryProducts {
  readonly rows: Product[] = [fuel(MS), fuel(HSD)];
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: STATION,
    businessDayId: null,
    actorId: 'user-1',
    correlationId: null,
    groupingRole: 'primary',
    clock: new FixedClock(new Date('2026-01-01T00:00:00.000Z')),
    ids: new SequentialIdGenerator('id'),
  };
}

function setup() {
  const dispensers = new InMemoryDispensers();
  const nozzles = new InMemoryNozzles();
  const tanks = new InMemoryTanks();
  const products = new InMemoryProducts();
  tanks.rows.push(tank('tank-ms', MS), tank('tank-hsd', HSD));
  const store = new InMemoryEventStore();
  const events = new InProcessEventDispatcher({ store });
  const useCase = new CreateDispenserWithNozzles({ dispensers, nozzles, tanks, products, events });
  const createNozzle = new CreateNozzle({ repository: nozzles, tanks, products, events });
  return { dispensers, nozzles, tanks, products, store, useCase, createNozzle };
}

const command = {
  stationId: STATION,
  name: 'Dispenser Unit 1',
  code: 'DU-01',
  nozzles: [
    { name: 'N1', tankId: 'tank-ms', productId: MS, currentReading: 1000 },
    { name: 'N2', tankId: 'tank-hsd', productId: HSD, currentReading: '250.5' },
  ],
};

describe('CreateDispenserWithNozzles', () => {
  it('creates the dispenser and every nozzle on it, with one event each', async () => {
    const { dispensers, nozzles, store, useCase } = setup();

    const result = await useCase.execute(command, makeContext());

    expect(result.success).toBe(true);
    if (!result.success) return;
    const du = result.data.dispenser;
    expect(du).toMatchObject({ stationId: STATION, code: 'DU-01', status: 'ACTIVE' });
    expect(dispensers.rows).toEqual([du]);
    expect(nozzles.rows).toEqual(result.data.nozzles);
    expect(nozzles.rows.map((n) => [n.name, n.duId, n.tankId, n.currentReading])).toEqual([
      ['N1', du.id, 'tank-ms', '1000'],
      ['N2', du.id, 'tank-hsd', '250.5'],
    ]);
    expect(store.events.map((e) => e.eventType)).toEqual([
      BusinessEvents.DISPENSER_CREATED,
      BusinessEvents.NOZZLE_CREATED,
      BusinessEvents.NOZZLE_CREATED,
    ]);
    expect(store.events.every((e) => e.stationId === STATION)).toBe(true);
  });

  it('creates a dispenser with no nozzles', async () => {
    const { dispensers, nozzles, store, useCase } = setup();

    const result = await useCase.execute({ ...command, nozzles: [] }, makeContext());

    expect(result.success).toBe(true);
    expect(dispensers.rows).toHaveLength(1);
    expect(nozzles.rows).toHaveLength(0);
    expect(store.events).toHaveLength(1);
  });

  it('writes nothing when a later nozzle names a tank of another product', async () => {
    const { dispensers, nozzles, store, useCase } = setup();

    const result = await useCase.execute(
      {
        ...command,
        nozzles: [command.nozzles[0], { name: 'N2', tankId: 'tank-ms', productId: HSD }],
      },
      makeContext(),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toBe('Nozzle Product must match its Tank Product');
    expect(result.error.details).toMatchObject({ nozzleIndex: 1 });
    expect(dispensers.rows).toHaveLength(0);
    expect(nozzles.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('writes nothing when a nozzle names an inactive or foreign tank', async () => {
    const { dispensers, nozzles, tanks, store, useCase } = setup();
    tanks.rows.push(
      tank('tank-off', MS, { status: 'INACTIVE' }),
      tank('tank-elsewhere', MS, { stationId: 'station-2' }),
      tank('tank-other-org', MS, { organizationId: 'org-2' }),
    );

    for (const tankId of ['tank-off', 'tank-elsewhere', 'tank-other-org', 'tank-missing']) {
      const result = await useCase.execute(
        { ...command, nozzles: [{ name: 'N1', tankId, productId: MS }] },
        makeContext(),
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.details).toMatchObject({ nozzleIndex: 0 });
    }
    expect(dispensers.rows).toHaveLength(0);
    expect(nozzles.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('refuses an invalid command before touching any tank', async () => {
    const { dispensers, store, useCase } = setup();

    const missingName = await useCase.execute(
      { ...command, nozzles: [{ name: '', tankId: 'tank-ms', productId: MS }] },
      makeContext(),
    );
    const tooMany = await useCase.execute(
      {
        ...command,
        nozzles: Array.from({ length: MAX_NOZZLES_PER_DISPENSER + 1 }, (_, i) => ({
          name: `N${i + 1}`,
          tankId: 'tank-ms',
          productId: MS,
        })),
      },
      makeContext(),
    );
    const noCode = await useCase.execute({ ...command, code: ' ' }, makeContext());

    for (const r of [missingName, tooMany, noCode]) {
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.code).toBe('VALIDATION_ERROR');
    }
    expect(dispensers.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it("writes nothing when a nozzle's product belongs to another organization", async () => {
    // A tank row naming a foreign product must not let a nozzle dispense it.
    const { dispensers, nozzles, tanks, products, store, useCase } = setup();
    products.rows.push(fuel('product-foreign', 'org-2'));
    tanks.rows.push(tank('tank-foreign-product', 'product-foreign'));

    const result = await useCase.execute(
      {
        ...command,
        nozzles: [
          command.nozzles[0],
          { name: 'N2', tankId: 'tank-foreign-product', productId: 'product-foreign' },
        ],
      },
      makeContext(),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.details).toMatchObject({ entity: 'Product', nozzleIndex: 1 });
    expect(dispensers.rows).toHaveLength(0);
    expect(nozzles.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });
});

describe('CreateNozzle — product tenancy', () => {
  it('refuses a product of another organization and writes nothing', async () => {
    const { nozzles, tanks, products, store, createNozzle } = setup();
    products.rows.push(fuel('product-foreign', 'org-2'));
    tanks.rows.push(tank('tank-foreign-product', 'product-foreign'));

    const result = await createNozzle.execute(
      {
        stationId: STATION,
        duId: 'du-1',
        name: 'N1',
        tankId: 'tank-foreign-product',
        productId: 'product-foreign',
      },
      makeContext(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(nozzles.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('creates a nozzle for a product of its own organization', async () => {
    const { nozzles, store, createNozzle } = setup();

    const result = await createNozzle.execute(
      { stationId: STATION, duId: 'du-1', name: 'N1', tankId: 'tank-ms', productId: MS },
      makeContext(),
    );

    expect(result.success).toBe(true);
    expect(nozzles.rows).toHaveLength(1);
    expect(store.events.map((e) => e.eventType)).toEqual([BusinessEvents.NOZZLE_CREATED]);
  });
});
