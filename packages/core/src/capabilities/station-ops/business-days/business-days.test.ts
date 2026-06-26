import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { OpenBusinessDay, CloseBusinessDay } from './index.js';
import type { BusinessDay, BusinessDayRepository } from './index.js';

class InMemoryBusinessDayRepo implements BusinessDayRepository {
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
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'station-1',
    businessDayId: null,
    actorId: 'user-1',
    correlationId: null,
    clock: new FixedClock(new Date('2026-03-15T05:30:00.000Z')),
    ids: new SequentialIdGenerator('bd'),
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

  it('rejects opening a second day while one is open', async () => {
    const repo = new InMemoryBusinessDayRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const ctx = makeContext();
    await new OpenBusinessDay({ repository: repo, events }).execute({ stationId: 'station-1' }, ctx);
    const second = await new OpenBusinessDay({ repository: repo, events }).execute({ stationId: 'station-1' }, ctx);
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.code).toBe('CONFLICT');
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
