import { describe, expect, it } from 'vitest';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import type {
  Decantation,
  DecantationLinkRepository,
  DecantationLinkView,
  LinkableFuelPurchase,
} from './ports.js';
import {
  DecantationLinker,
  LinkDecantationPurchase,
  UnlinkDecantationPurchase,
  ListLinkablePurchases,
} from './linking.js';
import { GetDecantation } from './queries.js';
import { RecordDecantation } from './record-decantation.js';

const purchase = (id: string, o: Partial<LinkableFuelPurchase> = {}): LinkableFuelPurchase => ({
  id,
  stationId: 'st-1',
  documentNumber: `PUR-${id}`,
  invoiceNumber: `INV-${id}`,
  supplierName: 'IOCL',
  entryDate: '2026-03-15',
  isFuelPurchase: true,
  lines: [{ productId: 'ms', quantity: 12000, invoiceDensity: 745 }],
  ...o,
});

const decantation = (): Decantation => ({
  id: 'd-1',
  organizationId: 'org-1',
  stationId: 'st-1',
  businessDayId: 'bd-1',
  documentNumber: 'DEC-1',
  tankerNumber: 'KA01',
  driverName: null,
  unloadStartedAt: null,
  unloadEndedAt: null,
  chambersChecked: false,
  status: 'PENDING_MEASUREMENT',
  flags: [],
  notes: null,
  recordedBy: 'u',
  createdAt: '2026-03-15T08:00:00Z',
  updatedAt: '2026-03-15T08:00:00Z',
  lines: [
    {
      id: 'l-1',
      decantationId: 'd-1',
      tankId: 't-ms',
      productId: 'ms',
      beforeDip: 1000,
      beforeDipAt: null,
      observedDensity: null,
      observedTempC: null,
      roDensity: 750,
      afterDip: null,
      afterDipAt: null,
      salesDuring: 0,
      receivedQty: null,
      measuredBy: null,
      measurementRefId: null,
      measuredAt: null,
      status: 'PENDING_MEASUREMENT',
    },
  ],
  chambers: [],
});

function setup(purchases: LinkableFuelPurchase[]) {
  const store = new InMemoryEventStore();
  const events = new InProcessEventDispatcher({ store });
  const d = decantation();
  const links: { decantationId: string; productId: string; purchaseId: string }[] = [];
  const settled: string[] = [];
  const saved: Decantation[] = [];
  const repo: DecantationLinkRepository = {
    findFuelPurchase: async (org, id) =>
      org === 'org-1' ? (purchases.find((p) => p.id === id) ?? null) : null,
    upsert: async (l) => {
      const i = links.findIndex(
        (x) => x.decantationId === l.decantationId && x.productId === l.productId,
      );
      if (i >= 0) links[i] = l;
      else links.push(l);
    },
    remove: async (_o, did, pid) => {
      const i = links.findIndex((x) => x.decantationId === did && x.productId === pid);
      if (i >= 0) links.splice(i, 1);
    },
    listViews: async () =>
      links.map<DecantationLinkView>((l) => {
        const p = purchases.find((x) => x.id === l.purchaseId)!;
        return {
          decantationId: l.decantationId,
          productId: l.productId,
          purchaseId: l.purchaseId,
          invoiceNumber: p.invoiceNumber,
          supplierName: p.supplierName,
          invoiceQty: p.lines[0].quantity,
          invoiceDensity: p.lines[0].invoiceDensity,
          receivedQty: null,
          varianceQty: null,
          varianceComputedAt: null,
        };
      }),
    listLinkable: async () => [],
  };
  const deps = {
    links: repo,
    decantations: {
      findById: async (_o: string, id: string) => (id === d.id ? d : null),
      updateMeasurement: async (x: Decantation) => void saved.push(structuredClone(x)),
    } as never,
    settler: {
      settleInvoice: async (_c: ExecutionContext, i: { purchaseId: string }) =>
        void settled.push(i.purchaseId),
      reverseLinkContribution: async () => {},
    },
    events,
    settings: { densityToleranceKgM3: 3, settlingTimeMinutes: 30 },
  };
  const ctx: ExecutionContext = {
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: null,
    actorId: 'u',
    correlationId: null,
    timeZone: 'UTC',
    businessDayStartsAt: '00:00',
    clock: new FixedClock(new Date('2026-03-15T10:00:00Z')),
    ids: new SequentialIdGenerator('i'),
  };
  return {
    d,
    links,
    settled,
    saved,
    store,
    ctx,
    link: new LinkDecantationPurchase(deps),
    unlink: new UnlinkDecantationPurchase(deps),
    linker: new DecantationLinker(deps),
    deps,
  };
}

const types = (s: InMemoryEventStore) => s.events.map((e) => e.eventType);

describe('LinkDecantationPurchase (#469)', () => {
  it('links a purchase, settles it and returns links + unlinkedProductIds', async () => {
    const s = setup([purchase('p1')]);
    const r = await s.link.execute(
      { decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' },
      s.ctx,
    );
    expect(r.success && r.data.links).toMatchObject([
      { productId: 'ms', purchaseId: 'p1', invoiceNumber: 'INV-p1', invoiceDensity: 745 },
    ]);
    expect(r.success && r.data.unlinkedProductIds).toEqual([]);
    expect(s.settled).toEqual(['p1']);
    expect(types(s.store)).toContain(BusinessEvents.DECANTATION_PURCHASE_LINKED);
  });

  it('flags density out of tolerance (RO 750 vs invoice 745) once, and clears it when replaced', async () => {
    const s = setup([
      purchase('p1'),
      purchase('p2', { lines: [{ productId: 'ms', quantity: 5000, invoiceDensity: 749 }] }),
    ]);
    await s.link.execute({ decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' }, s.ctx);
    expect(s.d.flags.map((f) => f.code)).toEqual(['DENSITY_OUT_OF_TOLERANCE']);
    expect(types(s.store)).toContain(BusinessEvents.DECANTATION_FLAGGED);
    // Second invoice for the same product replaces the first; 750 vs 749 is within tolerance.
    await s.link.execute({ decantationId: 'd-1', productId: 'ms', purchaseId: 'p2' }, s.ctx);
    expect(s.links).toHaveLength(1);
    expect(s.links[0].purchaseId).toBe('p2');
    expect(s.d.flags).toEqual([]);
    expect(s.settled).toEqual(['p1', 'p2', 'p1']);
  });

  it('re-linking the same purchase is a no-op', async () => {
    const s = setup([purchase('p1')]);
    await s.link.execute({ decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' }, s.ctx);
    const before = s.settled.length;
    await s.link.execute({ decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' }, s.ctx);
    expect(s.settled.length).toBe(before);
  });

  it('rejects a product the Decantation has no line of', async () => {
    const s = setup([
      purchase('p1', { lines: [{ productId: 'hsd', quantity: 1, invoiceDensity: null }] }),
    ]);
    const r = await s.link.execute(
      { decantationId: 'd-1', productId: 'hsd', purchaseId: 'p1' },
      s.ctx,
    );
    expect(r.success).toBe(false);
  });

  it('rejects a purchase without that product (wrong product)', async () => {
    const s = setup([
      purchase('p1', { lines: [{ productId: 'hsd', quantity: 1, invoiceDensity: null }] }),
    ]);
    const r = await s.link.execute(
      { decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' },
      s.ctx,
    );
    expect(r.success).toBe(false);
    expect(s.links).toHaveLength(0);
  });

  it('rejects a purchase of another station or organization', async () => {
    const s = setup([purchase('p1', { stationId: 'st-2' })]);
    const foreign = await s.link.execute(
      { decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' },
      s.ctx,
    );
    expect(!foreign.success && foreign.error.code).toBe('NOT_FOUND');
    const otherOrg = await s.link.execute(
      { decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' },
      { ...s.ctx, organizationId: 'org-2' },
    );
    expect(otherOrg.success).toBe(false);
  });

  it('rejects a Product Purchase (not a Fuel Purchase)', async () => {
    const s = setup([purchase('p1', { isFuelPurchase: false })]);
    const r = await s.link.execute(
      { decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' },
      s.ctx,
    );
    expect(r.success).toBe(false);
  });

  it('one purchase may link to many Decantations', async () => {
    const s = setup([purchase('p1')]);
    await s.link.execute({ decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' }, s.ctx);
    await s.deps.links.upsert({
      id: 'x',
      organizationId: 'org-1',
      stationId: 'st-1',
      decantationId: 'd-2',
      purchaseId: 'p1',
      productId: 'ms',
    });
    expect(s.links.map((l) => l.decantationId).sort()).toEqual(['d-1', 'd-2']);
  });
});

describe('UnlinkDecantationPurchase (#469)', () => {
  it('unlinks, drops the density flag, settles the invoice and emits UNLINKED', async () => {
    const s = setup([purchase('p1')]);
    await s.link.execute({ decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' }, s.ctx);
    const r = await s.unlink.execute({ decantationId: 'd-1', productId: 'ms' }, s.ctx);
    expect(r.success && r.data.links).toEqual([]);
    expect(r.success && r.data.unlinkedProductIds).toEqual(['ms']);
    expect(s.d.flags).toEqual([]);
    expect(types(s.store)).toContain(BusinessEvents.DECANTATION_PURCHASE_UNLINKED);
  });

  it('without a linked invoice there is no density to compare: a flag from the link goes, other flags stay', async () => {
    const s = setup([purchase('p1')]);
    await s.link.execute({ decantationId: 'd-1', productId: 'ms', purchaseId: 'p1' }, s.ctx);
    expect(s.d.flags.map((f) => f.code)).toContain('DENSITY_OUT_OF_TOLERANCE');
    s.d.flags.push({ code: 'SETTLING_TIME_SHORT', message: 'kept' } as never);
    await s.unlink.execute({ decantationId: 'd-1', productId: 'ms' }, s.ctx);
    expect(s.d.flags.map((f) => f.code)).toEqual(['SETTLING_TIME_SHORT']);
  });

  it('refuses when nothing is linked', async () => {
    const s = setup([purchase('p1')]);
    const r = await s.unlink.execute({ decantationId: 'd-1', productId: 'ms' }, s.ctx);
    expect(r.success).toBe(false);
  });
});

describe('reads and linkable query (#469)', () => {
  it('GetDecantation lists every product unlinked when no link exists', async () => {
    const s = setup([purchase('p1')]);
    const r = await new GetDecantation({
      decantations: s.deps.decantations,
      links: s.deps.links,
    }).execute({ decantationId: 'd-1' }, s.ctx);
    expect(r.success && r.data.unlinkedProductIds).toEqual(['ms']);
  });

  it('ListLinkablePurchases requires a station and product', async () => {
    const s = setup([]);
    const r = await new ListLinkablePurchases({ links: s.deps.links }).execute(
      { stationId: 'st-1' } as never,
      s.ctx,
    );
    expect(r.success).toBe(false);
  });
});

describe('RecordDecantation with links (#469)', () => {
  it('saves links in the same request, validates them, and flags density from the invoice', async () => {
    const s = setup([purchase('p1')]);
    const rows = new Map<string, Decantation>();
    const record = new RecordDecantation({
      decantations: {
        findById: async (_o: string, id: string) => rows.get(id) ?? null,
        insert: async (d: Decantation) => void rows.set(d.id, d),
        replace: async (d: Decantation) => void rows.set(d.id, d),
        updateMeasurement: async () => {},
      } as never,
      densityReadings: { saveMany: async () => {} },
      tanks: {
        findById: async () => ({
          id: 't-ms',
          organizationId: 'org-1',
          stationId: 'st-1',
          productId: 'ms',
          status: 'ACTIVE',
        }),
      } as never,
      businessDays: {
        findById: async () => null,
        findByStationAndDate: async () => ({
          id: 'bd-1',
          organizationId: 'org-1',
          stationId: 'st-1',
          businessDate: '2026-03-15',
          status: 'OPEN',
        }),
        lockStation: async () => {},
        lockById: async () => {},
        lockByStationAndDate: async () => {},
        save: async () => {},
      } as never,
      docNumbers: { next: async () => 'DEC-1' },
      events: s.deps.events,
      linking: s.linker,
    });
    const cmd = {
      stationId: 'st-1',
      tankerNumber: 'KA01',
      lines: [{ tankId: 't-ms', beforeDip: 100, roDensity: 751 }],
    };

    const bad = await record.execute(
      { ...cmd, links: [{ productId: 'hsd', purchaseId: 'p1' }] },
      s.ctx,
    );
    expect(bad.success).toBe(false);
    expect(rows.size).toBe(0);

    const ok = await record.execute(
      { ...cmd, links: [{ productId: 'ms', purchaseId: 'p1' }] },
      s.ctx,
    );
    expect(ok.success).toBe(true);
    expect(s.links).toHaveLength(1);
    expect(ok.success && ok.data.decantation.flags.map((f) => f.code)).toEqual([
      'DENSITY_OUT_OF_TOLERANCE',
    ]);
    expect(types(s.store)).toContain(BusinessEvents.DECANTATION_PURCHASE_LINKED);
    expect(s.settled).toEqual(['p1']);
  });
});
