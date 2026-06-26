import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type {
  DomainEvent,
  EventHandler,
  ExecutionContext,
} from '../../../kernel/index.js';
import { RegisterDemoEntity } from './handler.js';
import { DEMO_ENTITY_REGISTERED } from './events.js';
import type { DemoEntity, DemoEntityRepository } from './ports.js';

class InMemoryDemoRepo implements DemoEntityRepository {
  readonly rows: DemoEntity[] = [];

  async findById(id: string): Promise<DemoEntity | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async save(entity: DemoEntity): Promise<void> {
    this.rows.push(entity);
  }

  async existsByName(organizationId: string, name: string): Promise<boolean> {
    return this.rows.some(
      (r) => r.organizationId === organizationId && r.name === name,
    );
  }
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'station-1',
    businessDayId: null,
    actorId: 'user-1',
    correlationId: null,
    clock: new FixedClock(new Date('2026-01-01T00:00:00.000Z')),
    ids: new SequentialIdGenerator('demo'),
  };
}

describe('RegisterDemoEntity', () => {
  it('persists the entity and emits DEMO_ENTITY_REGISTERED', async () => {
    const repo = new InMemoryDemoRepo();
    const store = new InMemoryEventStore();
    const captured: DomainEvent[] = [];
    const spy: EventHandler = {
      name: 'spy',
      subscribesTo: '*',
      handle: async (e) => {
        captured.push(e);
      },
    };
    const events = new InProcessEventDispatcher({ store, handlers: [spy] });
    const useCase = new RegisterDemoEntity({ repository: repo, events });

    const result = await useCase.execute({ name: 'Acme' }, makeContext());

    expect(result.success).toBe(true);
    expect(repo.rows).toHaveLength(1);
    expect(store.events).toHaveLength(1);
    expect(store.events[0].eventType).toBe(DEMO_ENTITY_REGISTERED);
    expect(store.events[0].organizationId).toBe('org-1');
    expect(store.events[0].aggregateType).toBe('DemoEntity');
    expect(captured).toHaveLength(1);
    if (result.success) {
      expect(result.data.name).toBe('Acme');
      expect(store.events[0].aggregateId).toBe(result.data.id);
    }
  });

  it('rejects duplicate names with a CONFLICT error and emits nothing', async () => {
    const repo = new InMemoryDemoRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const useCase = new RegisterDemoEntity({ repository: repo, events });
    const ctx = makeContext();

    await useCase.execute({ name: 'Acme' }, ctx);
    const second = await useCase.execute({ name: 'Acme' }, ctx);

    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.error.code).toBe('CONFLICT');
    }
    expect(store.events).toHaveLength(1);
  });

  it('fails validation for an empty name', async () => {
    const repo = new InMemoryDemoRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const useCase = new RegisterDemoEntity({ repository: repo, events });

    const result = await useCase.execute({ name: '   ' }, makeContext());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(repo.rows).toHaveLength(0);
  });
});

describe('InProcessEventDispatcher', () => {
  it('isolates handler failures so other handlers still run', async () => {
    const store = new InMemoryEventStore();
    const ran: string[] = [];
    const failing: EventHandler = {
      name: 'failing',
      subscribesTo: '*',
      handle: async () => {
        throw new Error('boom');
      },
    };
    const healthy: EventHandler = {
      name: 'healthy',
      subscribesTo: [DEMO_ENTITY_REGISTERED],
      handle: async (e) => {
        ran.push(e.eventType);
      },
    };
    const dispatcher = new InProcessEventDispatcher({
      store,
      handlers: [failing, healthy],
    });
    const repo = new InMemoryDemoRepo();
    const useCase = new RegisterDemoEntity({ repository: repo, events: dispatcher });

    const result = await useCase.execute({ name: 'Acme' }, makeContext());

    expect(result.success).toBe(true);
    expect(store.events).toHaveLength(1);
    expect(ran).toEqual([DEMO_ENTITY_REGISTERED]);
  });
});
