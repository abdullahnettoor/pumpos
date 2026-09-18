import { describe, expect, it } from 'vitest';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { RefreshShiftSummary } from './refresh-shift-summary.js';
import type { Shift, ShiftRepository, ShiftSummaryProjector, ShiftSummaryStore } from './ports.js';

class ShiftRepo implements ShiftRepository {
  constructor(readonly rows: Shift[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findByIdWithoutLock(id: string) {
    return this.findById(id);
  }
  async save() {}
  async findOpenByStation() {
    return null;
  }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}

class SummaryStore implements ShiftSummaryStore {
  saved: { shiftId: string; snapshot: Record<string, unknown> } | null = null;
  constructor(private readonly existing: Record<string, Record<string, unknown>>) {}
  async findByShift(shiftId: string) {
    return this.existing[shiftId] ?? null;
  }
  async save(shiftId: string, snapshot: Record<string, unknown>) {
    this.saved = { shiftId, snapshot };
    this.existing[shiftId] = snapshot;
  }
  async deleteForShift() {}
}

/** Fake projection: enriches the base with live transaction lists/sums. */
class Projector implements ShiftSummaryProjector {
  calls = 0;
  constructor(private readonly live: Record<string, unknown>) {}
  async project(_shift: Shift, base: Record<string, unknown>) {
    this.calls += 1;
    return { ...base, ...this.live };
  }
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: 'bd',
    actorId: 'user-1',
    correlationId: null,
    clock: new FixedClock(new Date('2026-03-16T10:00:00.000Z')),
    ids: new SequentialIdGenerator('e'),
  };
}

function closedShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'sh-1',
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: 'bd',
    shiftTemplateId: 't',
    status: 'CLOSED',
    openedBy: 'u',
    openedAt: '2026-03-15T06:00:00.000Z',
    closedBy: 'u',
    closedAt: '2026-03-15T14:00:00.000Z',
    lockedAt: null,
    openingCash: '5000',
    closingCash: '9000',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('RefreshShiftSummary', () => {
  it('re-projects and saves the stored snapshot after a late attribution, preserving close-time drawer figures', async () => {
    const existing = {
      openingCash: 5000,
      closingCash: 9000,
      cashVariance: -50,
      expectedDrawerCash: 9050,
      creditSalesTotal: 0,
      creditSales: [],
    };
    const store = new SummaryStore({ 'sh-1': existing });
    // Live truth now includes a late credit sale + card collection sum.
    const projector = new Projector({
      creditSales: [{ id: 'cs-1', amount: 1200 }],
      creditSalesTotal: 1200,
      cardCollectionsSum: 800,
    });
    const eventStore = new InMemoryEventStore();
    const result = await new RefreshShiftSummary({
      shifts: new ShiftRepo([closedShift()]),
      summaries: store,
      projector,
      events: new InProcessEventDispatcher({ store: eventStore }),
    }).execute({ shiftId: 'sh-1' }, makeContext());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.refreshed).toBe(true);
    expect(store.saved?.shiftId).toBe('sh-1');
    // Late-attributed totals updated…
    expect(store.saved?.snapshot.creditSalesTotal).toBe(1200);
    expect(store.saved?.snapshot.cardCollectionsSum).toBe(800);
    // …while immutable close-time drawer figures are preserved.
    expect(store.saved?.snapshot.cashVariance).toBe(-50);
    expect(store.saved?.snapshot.expectedDrawerCash).toBe(9050);
    expect(store.saved?.snapshot.refreshedAt).toBe('2026-03-16T10:00:00.000Z');
    const events = eventStore.events;
    expect(events.map((e) => e.eventType)).toContain(BusinessEvents.SHIFT_SUMMARY_REFRESHED);
  });

  it('is idempotent: replaying against unchanged data writes the same snapshot', async () => {
    const store = new SummaryStore({ 'sh-1': { cashVariance: 0, openingCash: 5000 } });
    const projector = new Projector({ creditSalesTotal: 300 });
    const deps = {
      shifts: new ShiftRepo([closedShift()]),
      summaries: store,
      projector,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    };
    await new RefreshShiftSummary(deps).execute({ shiftId: 'sh-1' }, makeContext());
    const first = store.saved?.snapshot;
    await new RefreshShiftSummary(deps).execute({ shiftId: 'sh-1' }, makeContext());
    expect(store.saved?.snapshot).toEqual(first);
  });

  it('no-ops for an open shift', async () => {
    const store = new SummaryStore({});
    const projector = new Projector({});
    const result = await new RefreshShiftSummary({
      shifts: new ShiftRepo([closedShift({ status: 'OPEN' })]),
      summaries: store,
      projector,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1' }, makeContext());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.refreshed).toBe(false);
    expect(projector.calls).toBe(0);
    expect(store.saved).toBeNull();
  });

  it('no-ops when the shift has no stored summary', async () => {
    const store = new SummaryStore({});
    const projector = new Projector({});
    const result = await new RefreshShiftSummary({
      shifts: new ShiftRepo([closedShift()]),
      summaries: store,
      projector,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1' }, makeContext());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.refreshed).toBe(false);
    expect(projector.calls).toBe(0);
  });

  it('rejects a shift from another organization', async () => {
    const result = await new RefreshShiftSummary({
      shifts: new ShiftRepo([closedShift({ organizationId: 'org-2' })]),
      summaries: new SummaryStore({}),
      projector: new Projector({}),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1' }, makeContext());
    expect(result.success).toBe(false);
  });
});
