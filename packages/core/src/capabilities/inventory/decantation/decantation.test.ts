import { describe, expect, it } from 'vite-plus/test';
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
import { GetDecantation, ListDecantations } from './queries.js';
import { RecordDecantation } from './record-decantation.js';
import { DiscardDecantation } from './discard-decantation.js';
import type {
  Decantation,
  DecantationRepository,
  DensityReading,
  DensityReadingRepository,
} from './ports.js';
import { partialFake } from '../../../__tests__/partial-fake.js';

const day = (status: 'OPEN' | 'CLOSED' = 'OPEN'): BusinessDay => ({
  id: 'bd-1',
  organizationId: 'org-1',
  stationId: 'st-1',
  businessDate: '2026-03-15',
  status,
  openedBy: 'u',
  openedAt: '',
  closedBy: null,
  closedAt: null,
  createdAt: '',
  updatedAt: '',
});
const tank = (id: string, productId: string, o: Partial<Tank> = {}): Tank => ({
  id,
  organizationId: 'org-1',
  stationId: 'st-1',
  name: id,
  productId,
  capacity: '20000',
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
  ...o,
});

function setup(opts: { day?: BusinessDay; tanks?: Tank[] } = {}) {
  const store = new InMemoryEventStore();
  const rows = new Map<string, Decantation>();
  const readings: DensityReading[] = [];
  const bd = opts.day ?? day();
  const tanks = opts.tanks ?? [tank('t-ms', 'ms'), tank('t-hsd', 'hsd')];
  const useCase = new RecordDecantation({
    decantations: partialFake<DecantationRepository>({
      findById: async (org, id) => {
        const r = rows.get(id);
        return r && r.organizationId === org ? r : null;
      },
      insert: async (d) => void rows.set(d.id, d),
      replace: async (d) => {
        const prev = rows.get(d.id)!;
        readings.splice(
          0,
          readings.length,
          ...readings.filter((r) => !prev.lines.some((l) => l.id === r.decantationTankLineId)),
        );
        rows.set(d.id, d);
      },
      list: async () => [...rows.values()],
    }),
    densityReadings: partialFake<DensityReadingRepository>({
      saveMany: async (r) => void readings.push(...r),
    }),
    tanks: {
      findById: async (id: string) => tanks.find((t) => t.id === id) ?? null,
    } as never,
    businessDays: {
      findById: async (id: string) => (id === bd.id ? bd : null),
      findByStationAndDate: async () => bd,
      lockStation: async () => {},
      lockById: async () => {},
      lockByStationAndDate: async () => {},
      save: async () => {},
    } as never,
    docNumbers: { next: async (t: string) => `${t.slice(0, 3)}-000001` },
    events: new InProcessEventDispatcher({ store }),
  });
  const ctx = (): ExecutionContext => ({
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: null,
    actorId: 'u',
    correlationId: null,
    clock: new FixedClock(new Date('2026-03-15T10:00:00Z')),
    ids: new SequentialIdGenerator('i'),
  });
  return { useCase, rows, readings, store, ctx };
}

const base = {
  stationId: 'st-1',
  tankerNumber: 'KA01AB1234',
  lines: [
    { tankId: 't-ms', beforeDip: 4000, roDensity: 745, observedDensity: 748, observedTempC: 30 },
  ],
};

describe('RecordDecantation', () => {
  it('creates a PENDING_MEASUREMENT visit anchored to the business day, with a density reading', async () => {
    const { useCase, ctx, readings, store, rows } = setup();
    const r = await useCase.execute(base, ctx());
    expect(r.success).toBe(true);
    if (!r.success) return;
    const d = r.data.decantation;
    expect(d).toMatchObject({
      status: 'PENDING_MEASUREMENT',
      businessDayId: 'bd-1',
      documentNumber: 'DEC-000001',
    });
    expect(d.lines[0].productId).toBe('ms');
    expect(rows.size).toBe(1);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      kind: 'DECANTATION',
      entryMethod: 'HYDROMETER',
      density15: 745,
    });
    expect(store.events.map((e) => e.eventType)).toEqual([
      BusinessEvents.DECANTATION_RECORDED,
      BusinessEvents.DENSITY_RECORDED,
    ]);
  });

  it('saves chambers, flags without rejecting, and warns on excess', async () => {
    const { useCase, ctx, store } = setup();
    const r = await useCase.execute(
      {
        ...base,
        lines: [{ ...base.lines[0], invoiceDensity: 740 }],
        unloadEndedAt: '2026-03-15T09:00:00Z',
        chambers: [
          { chamberNo: 1, capacityL: 4000, mark: 'SHORT', tankLineIndex: 0, emptied: false },
          { chamberNo: 2, capacityL: 4000, mark: 'EXCESS', sealOk: true, emptied: true },
        ],
        invoiceQuantity: 12000,
      },
      ctx(),
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.decantation.flags.map((f) => f.code).sort()).toEqual([
      'CHAMBER_NOT_EMPTIED',
      'DENSITY_OUT_OF_TOLERANCE',
      'TANKER_SHORT',
    ]);
    expect(r.data.warnings.map((w) => w.code)).toEqual([
      'CHAMBER_EXCESS',
      'CHAMBER_CAPACITY_MISMATCH',
    ]);
    expect(r.data.decantation.chambers[0].tankLineId).toBe(r.data.decantation.lines[0].id);
    expect(store.events.map((e) => e.eventType)).toContain(BusinessEvents.DECANTATION_FLAGGED);
  });

  it('flags an early after dip', async () => {
    const { useCase, ctx } = setup();
    const r = await useCase.execute(
      {
        ...base,
        unloadEndedAt: '2026-03-15T09:50:00Z',
        lines: [{ ...base.lines[0], afterDip: 9000 }],
      },
      ctx(),
    );
    expect(r.success && r.data.decantation.flags.map((f) => f.code)).toEqual(['EARLY_AFTER_DIP']);
  });

  it('updates while not measured, replaces readings, and flags only new reasons', async () => {
    const { useCase, ctx, readings, store } = setup();
    const created = await useCase.execute(
      { ...base, chambers: [{ chamberNo: 1, mark: 'SHORT' }] },
      ctx(),
    );
    if (!created.success) throw new Error('create failed');
    const d = created.data.decantation;
    store.events.length = 0;
    const updated = await useCase.execute(
      {
        ...base,
        decantationId: d.id,
        lines: [{ ...base.lines[0], id: d.lines[0].id, roDensity: 746, afterDip: 9000 }],
        chambers: [{ chamberNo: 1, mark: 'SHORT' }],
      },
      ctx(),
    );
    expect(updated.success).toBe(true);
    if (!updated.success) return;
    expect(updated.data.decantation.id).toBe(d.id);
    expect(updated.data.decantation.documentNumber).toBe(d.documentNumber);
    expect(updated.data.decantation.lines[0].id).toBe(d.lines[0].id);
    expect(readings).toHaveLength(1);
    expect(readings[0].density15).toBe(746);
    expect(store.events.map((e) => e.eventType)).not.toContain(BusinessEvents.DECANTATION_FLAGGED);
  });

  it('refuses to edit a measured line, a closed day, and foreign tanks', async () => {
    const a = setup();
    const created = await a.useCase.execute(base, a.ctx());
    if (!created.success) throw new Error('x');
    const d = created.data.decantation;
    d.lines[0].status = 'MEASURED';
    const edit = await a.useCase.execute({ ...base, decantationId: d.id }, a.ctx());
    expect(edit.success).toBe(false);

    const closed = setup({ day: day('CLOSED') });
    expect((await closed.useCase.execute(base, closed.ctx())).success).toBe(false);

    const foreign = setup({ tanks: [tank('t-ms', 'ms', { stationId: 'st-2' })] });
    expect((await foreign.useCase.execute(base, foreign.ctx())).success).toBe(false);
  });

  it('validates input', async () => {
    const { useCase, ctx } = setup();
    expect((await useCase.execute({ ...base, lines: [] }, ctx())).success).toBe(false);
    expect((await useCase.execute({ ...base, tankerNumber: ' ' }, ctx())).success).toBe(false);
    expect(
      (await useCase.execute({ ...base, lines: [base.lines[0], base.lines[0]] }, ctx())).success,
    ).toBe(false);
  });
});

describe('Get/ListDecantations', () => {
  it('is org + station scoped', async () => {
    const { useCase, ctx, rows } = setup();
    const created = await useCase.execute(base, ctx());
    if (!created.success) throw new Error('x');
    const get = new GetDecantation({
      decantations: {
        findById: async (o: string, id: string) => (o === 'org-1' ? (rows.get(id) ?? null) : null),
      } as never,
    });
    const id = created.data.decantation.id;
    expect((await get.execute({ stationId: 'st-1', decantationId: id }, ctx())).success).toBe(true);
    expect((await get.execute({ stationId: 'st-2', decantationId: id }, ctx())).success).toBe(
      false,
    );
    const list = new ListDecantations({
      decantations: { list: async () => [...rows.values()] } as never,
    });
    expect(
      (await list.execute({ stationId: 'st-1', from: '2026-03-16', to: '2026-03-01' }, ctx()))
        .success,
    ).toBe(false);
    expect((await list.execute({ stationId: 'st-1' }, ctx())).success).toBe(true);
  });
});

describe('DiscardDecantation', () => {
  it('soft-discards only a DRAFT, keeps the row and emits DECANTATION_DISCARDED', async () => {
    const { useCase, ctx, rows, store } = setup();
    const shared = ctx();
    const draft = await useCase.execute({ ...base, draft: true }, shared);
    const measuredLike = await useCase.execute(
      { ...base, lines: [{ ...base.lines[0], tankId: 't-hsd' }] },
      shared,
    );
    if (!draft.success || !measuredLike.success) throw new Error('setup failed');
    const repo = {
      findById: async (_o: string, id: string) => rows.get(id) ?? null,
      updateMeasurement: async (d: Decantation) => void rows.set(d.id, d),
    };
    const discard = new DiscardDecantation({
      decantations: repo as never,
      events: new InProcessEventDispatcher({ store }),
    });
    const refused = await discard.execute(
      { decantationId: measuredLike.data.decantation.id },
      ctx(),
    );
    expect(refused.success).toBe(false);

    const r = await discard.execute({ decantationId: draft.data.decantation.id }, ctx());
    expect(r.success).toBe(true);
    expect(rows.get(draft.data.decantation.id)?.status).toBe('DISCARDED');
    expect(rows.get(draft.data.decantation.id)?.lines).toHaveLength(1);
    expect(store.events.map((e) => e.eventType)).toContain(BusinessEvents.DECANTATION_DISCARDED);

    const again = await discard.execute({ decantationId: draft.data.decantation.id }, ctx());
    expect(again.success).toBe(false);
  });
});
