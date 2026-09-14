import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { OpenBusinessDay, CloseBusinessDay, resolveBusinessDayWrite } from './index.js';
import type { BusinessDay, BusinessDayWriteRepository } from './index.js';

class InMemoryBusinessDayRepo implements BusinessDayWriteRepository {
  readonly rows: BusinessDay[] = [];
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save(d: BusinessDay) {
    const idx = this.rows.findIndex((r) => r.id === d.id);
    if (idx >= 0) this.rows[idx] = d;
    else this.rows.push(d);
  }
  async findOpenByStation(orgId: string, stationId: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN') ?? null;
  }
  async findByStationAndDate(orgId: string, stationId: string, businessDate: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId && r.businessDate === businessDate) ?? null;
  }
  async lockStation() {}
  async lockById() {}
  async lockByStationAndDate() {}
}

function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'station-1',
    businessDayId: null,
    actorId: 'user-1',
    correlationId: null,
    clock: new FixedClock(new Date('2026-03-15T05:30:00.000Z')),
    ids: new SequentialIdGenerator('bd'),
    ...overrides,
  };
}

describe('OpenBusinessDay', () => {
  it('opens a day and emits BUSINESS_DAY_OPENED', async () => {
    const repo = new InMemoryBusinessDayRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const result = await new OpenBusinessDay({ repository: repo, events }).execute({ stationId: 'station-1' }, makeContext());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('OPEN');
      expect(result.data.businessDate).toBe('2026-03-15');
    }
    expect(store.events[0].eventType).toBe(BusinessEvents.BUSINESS_DAY_OPENED);
    expect(store.events[0].businessDayId).toBeTruthy();
  });

  it('rejects creating a duplicate Business Day for the same Business Date', async () => {
    const repo = new InMemoryBusinessDayRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();
    await new OpenBusinessDay({ repository: repo, events }).execute({ stationId: 'station-1' }, ctx);
    const second = await new OpenBusinessDay({ repository: repo, events }).execute({ stationId: 'station-1' }, ctx);
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.code).toBe('CONFLICT');
  });

  it('allows several Business Days to remain open concurrently', async () => {
    const repo = new InMemoryBusinessDayRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const useCase = new OpenBusinessDay({ repository: repo, events });
    const ctx = makeContext();

    const first = await useCase.execute({ stationId: 'station-1', businessDate: '2026-03-14' }, ctx);
    const second = await useCase.execute({ stationId: 'station-1', businessDate: '2026-03-15' }, ctx);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(repo.rows.filter((day) => day.status === 'OPEN')).toHaveLength(2);
  });

  it('rejects a calendar-invalid Business Date without saving or publishing an event', async () => {
    const repo = new InMemoryBusinessDayRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });

    const result = await new OpenBusinessDay({ repository: repo, events }).execute(
      { stationId: 'station-1', businessDate: '2026-02-31' },
      makeContext(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('rejects the local calendar date before the Station Day Start without saving or publishing an event', async () => {
    const repo = new InMemoryBusinessDayRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const ctx = makeContext({
      clock: new FixedClock(new Date('2026-03-01T00:29:00.000Z')),
      timeZone: 'Asia/Kolkata',
      businessDayStartsAt: '06:00',
    });

    const result = await new OpenBusinessDay({ repository: repo, events }).execute(
      { stationId: 'station-1', businessDate: '2026-03-01' },
      ctx,
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });
});

describe('CloseBusinessDay', () => {
  it('closes an open day and emits BUSINESS_DAY_CLOSED', async () => {
    const repo = new InMemoryBusinessDayRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const ctx = makeContext();
    const opened = await new OpenBusinessDay({ repository: repo, events }).execute({ stationId: 'station-1' }, ctx);
    const id = opened.success ? opened.data.id : '';
    const result = await new CloseBusinessDay({ repository: repo, events }).execute({ businessDayId: id }, ctx);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('CLOSED');
    expect(store.events.some((e) => e.eventType === BusinessEvents.BUSINESS_DAY_CLOSED)).toBe(true);
  });

  it('rejects closing an already-closed day', async () => {
    const repo = new InMemoryBusinessDayRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();
    const opened = await new OpenBusinessDay({ repository: repo, events }).execute({ stationId: 'station-1' }, ctx);
    const id = opened.success ? opened.data.id : '';
    await new CloseBusinessDay({ repository: repo, events }).execute({ businessDayId: id }, ctx);
    const again = await new CloseBusinessDay({ repository: repo, events }).execute({ businessDayId: id }, ctx);
    expect(again.success).toBe(false);
    if (!again.success) expect(again.error.code).toBe('INVARIANT_VIOLATION');
  });
});

describe('resolveBusinessDayWrite', () => {
  it('opens a nonexistent historical day for its first financial entry', async () => {
    const repo = new InMemoryBusinessDayRepo();
    const result = await resolveBusinessDayWrite(repo, makeContext(), {
      stationId: 'station-1',
      businessDate: '2026-03-14',
      kind: 'FINANCIAL',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessDay.status).toBe('OPEN');
      expect(result.data.lateEntry).toBe(false);
    }
  });

  it('accepts stock writes to a lazily-created historical day while it is open', async () => {
    const repo = new InMemoryBusinessDayRepo();
    const result = await resolveBusinessDayWrite(repo, makeContext(), {
      stationId: 'station-1',
      businessDate: '2026-03-14',
      kind: 'STOCK',
    });

    expect(result.success).toBe(true);
    expect(repo.rows[0]?.status).toBe('OPEN');
  });
});
