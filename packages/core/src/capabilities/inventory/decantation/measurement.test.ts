import { describe, expect, it } from 'vitest';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import type { BusinessDay } from '../../station-ops/business-days/index.js';
import type { Tank } from '../../station-setup/tanks/index.js';
import type { StockMovement } from '../ports.js';
import { RecordStockCount } from '../record-stock-count.js';
import { DecantationMeasurementService } from './measurement.js';
import { RecordDecantation } from './record-decantation.js';
import type { Decantation, DecantationPurchaseLink } from './ports.js';

const mkDay = (id: string, date: string, status: 'OPEN' | 'CLOSED'): BusinessDay => ({
  id,
  organizationId: 'org-1',
  stationId: 'st-1',
  businessDate: date,
  status,
  openedBy: 'u',
  openedAt: '',
  closedBy: null,
  closedAt: null,
  createdAt: '',
  updatedAt: '',
});
const tank: Tank = {
  id: 't-ms',
  organizationId: 'org-1',
  stationId: 'st-1',
  name: 'MS-1',
  productId: 'ms',
  capacity: '20000',
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
};

function setup(opts: { days?: BusinessDay[]; openShift?: boolean; sold?: number } = {}) {
  const days = opts.days ?? [mkDay('bd-1', '2026-03-15', 'OPEN')];
  const current = days.find((d) => d.status === 'OPEN') ?? days[0];
  const store = new InMemoryEventStore();
  const events = new InProcessEventDispatcher({ store });
  const rows = new Map<string, Decantation>();
  const movements: StockMovement[] = [
    {
      id: 'm0',
      shiftId: null,
      businessDayId: current.id,
      productId: 'ms',
      tankId: 't-ms',
      movementType: 'OpeningBalance',
      quantity: '4000',
      referenceType: null,
      referenceId: null,
      notes: null,
      createdAt: '2026-03-01T00:00:00Z',
    },
  ];
  const links: DecantationPurchaseLink[] = [];
  const product = { id: 'ms', organizationId: 'org-1', costBasis: '90' as string | null };
  const variances: unknown[] = [];

  const decantations = {
    findById: async (_o: string, id: string) => rows.get(id) ?? null,
    insert: async (d: Decantation) => void rows.set(d.id, structuredClone(d)),
    replace: async (d: Decantation) => void rows.set(d.id, structuredClone(d)),
    list: async () => [...rows.values()],
    findPendingForTank: async (_o: string, _s: string, tankId: string) =>
      [...rows.values()]
        .filter((d) => d.status !== 'DRAFT')
        .filter((d) =>
          d.lines.some((l) => l.tankId === tankId && l.status === 'PENDING_MEASUREMENT'),
        )
        .map((d) => structuredClone(d)),
    updateMeasurement: async (d: Decantation) => void rows.set(d.id, structuredClone(d)),
  };
  const movementsRepo = {
    save: async (m: StockMovement) => void movements.push(m),
    saveMany: async (ms: StockMovement[]) => void movements.push(...ms),
    currentQuantityForTank: async (id: string) =>
      movements.filter((m) => m.tankId === id).reduce((s, m) => s + Number(m.quantity), 0),
    currentQuantityForProduct: async (_o: string, id: string) =>
      movements.filter((m) => m.productId === id).reduce((s, m) => s + Number(m.quantity), 0),
  };
  const service = new DecantationMeasurementService({
    decantations,
    links: {
      listForPurchaseProduct: async (_o, p, prod) =>
        links.filter((l) => l.purchaseId === p && l.productId === prod),
      listForDecantation: async (_o, id) => links.filter((l) => l.decantationId === id),
      updateVariance: async (l) =>
        void Object.assign(
          links.find((x) => x.id === l.id)!,
          l,
        ),
      invoiceLine: async () => ({ quantity: 12000, value: 12000 * 100 }),
    },
    movements: movementsRepo,
    products: {
      findById: async () => product as never,
      updateCostBasis: async (_id, c) => void (product.costBasis = c),
    },
    sales: { litresSoldBetween: async () => opts.sold ?? 0 },
    events,
  });
  const businessDays = {
    findById: async (id: string) => days.find((d) => d.id === id) ?? null,
    findByStationAndDate: async (_o: string, _s: string, date: string) =>
      days.find((d) => d.businessDate === date) ?? null,
    lockStation: async () => {},
    lockById: async () => {},
    lockByStationAndDate: async () => {},
    save: async () => {},
  } as never;
  const record = new RecordDecantation({
    decantations,
    densityReadings: { saveMany: async () => {} },
    tanks: { findById: async () => tank } as never,
    businessDays,
    docNumbers: { next: async () => 'DEC-000001' },
    events,
    measurement: service,
  });
  const count = new RecordStockCount({
    movements: movementsRepo,
    variances: { save: async (v) => void variances.push(v), existsForShift: async () => false },
    tanks: { findByIdForUpdate: async () => tank } as never,
    shifts: {
      findOpenByStation: async () => (opts.openShift ? ({ id: 'sh-1' } as never) : null),
    } as never,
    businessDays,
    events,
    decantationMeasurement: service,
  });
  const ctx = (now = '2026-03-15T10:00:00Z'): ExecutionContext => ({
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: null,
    actorId: 'u',
    correlationId: null,
    timeZone: 'UTC',
    businessDayStartsAt: '00:00',
    clock: new FixedClock(new Date(now)),
    ids: new SequentialIdGenerator('i'),
  });
  const stock = () => movementsRepo.currentQuantityForTank('t-ms');
  return { record, count, service, ctx, rows, movements, links, product, store, stock, variances };
}

const cmd = (line: Record<string, unknown> = {}) => ({
  stationId: 'st-1',
  tankerNumber: 'KA01',
  lines: [{ tankId: 't-ms', beforeDip: 4000, ...line }],
});

describe('measurement: after dip path', () => {
  it('posts a Decantation movement on the current day and marks MEASURED', async () => {
    const t = setup();
    const r = await t.record.execute(cmd({ afterDip: 15500, salesDuring: 500 }), t.ctx());
    if (!r.success) throw new Error(JSON.stringify(r.error));
    const d = r.data.decantation;
    expect(d.status).toBe('MEASURED');
    expect(d.lines[0]).toMatchObject({
      status: 'MEASURED',
      receivedQty: 12000,
      measuredBy: 'AFTER_DIP',
    });
    const m = t.movements.find((x) => x.movementType === 'Decantation')!;
    expect(m).toMatchObject({
      quantity: '12000',
      tankId: 't-ms',
      businessDayId: 'bd-1',
      referenceType: 'decantation_tank_line',
      referenceId: d.lines[0].id,
    });
    expect(await t.stock()).toBe(16000);
    const types = t.store.events.map((e) => e.eventType);
    expect(types).toContain(BusinessEvents.STOCK_MOVEMENT_RECORDED);
    expect(t.rows.get(d.id)!.status).toBe('MEASURED');
  });

  it('a pending line adds no stock', async () => {
    const t = setup();
    const r = await t.record.execute(cmd(), t.ctx());
    expect(r.success && r.data.decantation.status).toBe('PENDING_MEASUREMENT');
    expect(t.movements.some((x) => x.movementType === 'Decantation')).toBe(false);
    expect(await t.stock()).toBe(4000);
  });

  it('an after dip below the before dip saves and leaves the line pending (never blocks)', async () => {
    const t = setup();
    const r = await t.record.execute(cmd({ afterDip: 3000 }), t.ctx());
    if (!r.success) throw new Error(JSON.stringify(r.error));
    expect(r.data.decantation.lines[0].status).toBe('PENDING_MEASUREMENT');
    expect(t.movements.some((x) => x.movementType === 'Decantation')).toBe(false);
  });

  it('a draft never measures', async () => {
    const t = setup();
    await t.record.execute({ ...cmd({ afterDip: 9000 }), draft: true }, t.ctx());
    expect(t.movements).toHaveLength(1);
  });

  it('adds an after dip to a Decantation on a sealed day, booking on the open day', async () => {
    const t = setup({
      days: [mkDay('bd-1', '2026-03-15', 'OPEN')],
    });
    const created = await t.record.execute(cmd(), t.ctx());
    if (!created.success) throw new Error('create');
    const d = created.data.decantation;
    // Day 1 is sealed and day 2 opens.
    const days = [mkDay('bd-1', '2026-03-15', 'CLOSED'), mkDay('bd-2', '2026-03-16', 'OPEN')];
    const t2 = setup({ days });
    t2.rows.set(d.id, structuredClone(d));
    const r = await t2.record.execute(
      {
        ...cmd({ afterDip: 9000, beforeDip: 1, tankId: 't-ms' }),
        decantationId: d.id,
        tankerNumber: 'CHANGED',
      },
      t2.ctx('2026-03-16T08:00:00Z'),
    );
    if (!r.success) throw new Error(JSON.stringify(r.error));
    expect(r.data.decantation.tankerNumber).toBe('KA01'); // sealed fields untouched
    expect(r.data.decantation.lines[0].beforeDip).toBe(4000);
    expect(r.data.decantation.lines[0].receivedQty).toBe(5000);
    const m = t2.movements.find((x) => x.movementType === 'Decantation')!;
    expect(m.businessDayId).toBe('bd-2');
    expect(r.data.decantation.businessDayId).toBe('bd-1');

    // Nothing but an after dip may change on a sealed day.
    const again = await t2.record.execute(
      { ...cmd(), decantationId: d.id },
      t2.ctx('2026-03-16T08:00:00Z'),
    );
    expect(again.success).toBe(false);
  });
});

describe('measurement: tank dip path', () => {
  it('resolves the pending line before expected is read: no double count', async () => {
    const t = setup({ sold: 300 });
    const created = await t.record.execute(cmd(), t.ctx());
    if (!created.success) throw new Error('create');
    // Book 4000; tanker brought 12000, 300 sold since: tank now holds 15700.
    const r = await t.count.execute(
      { stationId: 'st-1', tankId: 't-ms', actualQuantity: 15700 },
      t.ctx('2026-03-15T18:00:00Z'),
    );
    if (!r.success) throw new Error(JSON.stringify(r.error));
    expect(r.data.expectedQuantity).toBe(16000); // 4000 + 12000 received
    expect(r.data.varianceQuantity).toBe(-300); // only the unbooked sales remain
    const line = t.rows.get(created.data.decantation.id)!.lines[0];
    expect(line).toMatchObject({ status: 'MEASURED', receivedQty: 12000, measuredBy: 'TANK_DIP' });
    expect(t.rows.get(created.data.decantation.id)!.status).toBe('MEASURED');
    expect(line.measurementRefId).toBe(r.data.variance.id);
    expect(t.movements.filter((m) => m.movementType === 'Decantation')).toHaveLength(1);
  });

  it('leaves the line pending while a shift is open', async () => {
    const t = setup({ openShift: true });
    const created = await t.record.execute(cmd(), t.ctx());
    if (!created.success) throw new Error('create');
    await t.count.execute({ stationId: 'st-1', tankId: 't-ms', actualQuantity: 15700 }, t.ctx());
    expect(t.rows.get(created.data.decantation.id)!.lines[0].status).toBe('PENDING_MEASUREMENT');
    expect(t.movements.some((m) => m.movementType === 'Decantation')).toBe(false);
  });
});

describe('invoice variance and WAC', () => {
  const link = (d: Decantation): DecantationPurchaseLink => ({
    id: 'lk-1',
    organizationId: 'org-1',
    stationId: 'st-1',
    decantationId: d.id,
    purchaseId: 'p-1',
    productId: 'ms',
    receivedQty: null,
    invoiceQty: null,
    varianceQty: null,
    varianceComputedAt: null,
  });

  it('shows a short variance and moves WAC once the invoice lines are measured', async () => {
    const t = setup();
    const created = await t.record.execute(cmd(), t.ctx());
    if (!created.success) throw new Error('create');
    t.links.push(link(created.data.decantation));
    // pending: nothing settled
    await t.service.settleInvoice(t.ctx(), { purchaseId: 'p-1', productId: 'ms' });
    expect(t.links[0].varianceComputedAt).toBeNull();

    await t.record.execute(
      {
        ...cmd({ id: created.data.decantation.lines[0].id, afterDip: 15900 }),
        decantationId: created.data.decantation.id,
      },
      t.ctx(),
    );
    expect(t.links[0]).toMatchObject({ receivedQty: 11900, invoiceQty: 12000, varianceQty: -100 });
    expect(t.links[0].varianceComputedAt).not.toBeNull();
    // on hand before receipt 4000 @90 + 1,200,000 over 15,900 L
    expect(Number(t.product.costBasis)).toBeCloseTo((4000 * 90 + 1_200_000) / 15900, 3);

    // idempotent: a second settle does not re-blend cost
    const cost = t.product.costBasis;
    await t.service.settleInvoice(t.ctx(), { purchaseId: 'p-1', productId: 'ms' });
    expect(t.product.costBasis).toBe(cost);
  });
});
