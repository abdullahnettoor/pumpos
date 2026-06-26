import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { RegisterPaymentTerminal } from './register-payment-terminal.js';
import { UpdatePaymentTerminal } from './update-payment-terminal.js';
import type { PaymentTerminal, PaymentTerminalRepository } from './ports.js';

class InMemoryTerminalRepo implements PaymentTerminalRepository {
  readonly rows: PaymentTerminal[] = [];
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save(t: PaymentTerminal) {
    const idx = this.rows.findIndex((r) => r.id === t.id);
    if (idx >= 0) this.rows[idx] = t;
    else this.rows.push(t);
  }
  async existsByLabel(orgId: string, stationId: string, label: string, excludeId?: string) {
    return this.rows.some(
      (r) =>
        r.organizationId === orgId &&
        r.stationId === stationId &&
        r.label === label &&
        r.id !== excludeId,
    );
  }
  async listByStation(orgId: string, stationId: string) {
    return this.rows.filter((r) => r.organizationId === orgId && r.stationId === stationId);
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
    ids: new SequentialIdGenerator('pt'),
  };
}

describe('RegisterPaymentTerminal', () => {
  it('registers a terminal and emits PAYMENT_TERMINAL_REGISTERED', async () => {
    const repo = new InMemoryTerminalRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const useCase = new RegisterPaymentTerminal({ repository: repo, events });

    const result = await useCase.execute(
      { stationId: '00000000-0000-4000-8000-000000000010', label: 'Counter PoS' },
      makeContext(),
    );

    expect(result.success).toBe(true);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].supportsCard).toBe(true);
    expect(store.events).toHaveLength(1);
    expect(store.events[0].eventType).toBe(BusinessEvents.PAYMENT_TERMINAL_REGISTERED);
    expect(store.events[0].stationId).toBe('00000000-0000-4000-8000-000000000010');
  });

  it('rejects a duplicate label for the same station', async () => {
    const repo = new InMemoryTerminalRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const useCase = new RegisterPaymentTerminal({ repository: repo, events });
    const ctx = makeContext();
    const cmd = { stationId: '00000000-0000-4000-8000-000000000010', label: 'Counter PoS' };

    await useCase.execute(cmd, ctx);
    const second = await useCase.execute(cmd, ctx);

    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.code).toBe('CONFLICT');
  });
});

describe('UpdatePaymentTerminal', () => {
  it('updates fields and emits PAYMENT_TERMINAL_UPDATED', async () => {
    const repo = new InMemoryTerminalRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const ctx = makeContext();
    const reg = await new RegisterPaymentTerminal({ repository: repo, events }).execute(
      { stationId: '00000000-0000-4000-8000-000000000010', label: 'Counter PoS' },
      ctx,
    );
    expect(reg.success).toBe(true);
    const id = reg.success ? reg.data.id : '';

    const result = await new UpdatePaymentTerminal({ repository: repo, events }).execute(
      { id, label: 'Forecourt PoS', isActive: false },
      ctx,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe('Forecourt PoS');
      expect(result.data.isActive).toBe(false);
    }
    const updatedEvent = store.events.find((e) => e.eventType === BusinessEvents.PAYMENT_TERMINAL_UPDATED);
    expect(updatedEvent).toBeTruthy();
  });

  it('returns NOT_FOUND for an unknown id', async () => {
    const repo = new InMemoryTerminalRepo();
    const events = new InProcessEventDispatcher({ store: new InMemoryEventStore() });
    const result = await new UpdatePaymentTerminal({ repository: repo, events }).execute(
      { id: '00000000-0000-4000-8000-0000000000ff', label: 'x' },
      makeContext(),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});
