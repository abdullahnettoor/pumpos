import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { CreateStation, type Station } from './index.js';
import type { OrganizationAccessInputs } from '../../organization-access/ports.js';

/**
 * `station_count` is a commercial Limit, so it has to hold on *every* path
 * that creates a Station row. Onboarding finalization is the usual one, but
 * `POST /setup/stations` creates one too — and a Limit enforced on only one
 * endpoint is not enforced at all.
 */

const inputs = (stations: number): OrganizationAccessInputs => ({
  plan: 'CORE',
  subscriptionStatus: 'ACTIVE',
  accessUntil: null,
  grantedCapabilities: [],
  limitOverrides: {},
  usage: { station_count: stations },
});

function capacityPort(stations: number) {
  const port = {
    locked: 0,
    lockOrganization: async () => {
      port.locked += 1;
    },
    load: async () => inputs(stations),
  };
  return port;
}

class FakeStationRepository {
  saved: Station[] = [];
  async save(station: Station) {
    this.saved.push(station);
  }
  async findById(id: string) {
    return this.saved.find((s) => s.id === id) ?? null;
  }
  async listByOrganization() {
    return this.saved;
  }
  async delete() {}
}

const ctx = (): ExecutionContext => ({
  organizationId: 'org-1',
  stationId: null,
  businessDayId: null,
  actorId: 'owner-1',
  correlationId: 'correlation-1',
  clock: new FixedClock(new Date('2026-09-19T08:00:00.000Z')),
  ids: new SequentialIdGenerator('id'),
});

const command = { name: 'Second Station', code: 'ST2' };

function harness(stations: number) {
  const repository = new FakeStationRepository();
  const store = new InMemoryEventStore();
  const capacity = capacityPort(stations);
  const useCase = new CreateStation({
    repository: repository as never,
    capacity,
    events: new InProcessEventDispatcher({ store }),
  });
  return { repository, store, capacity, useCase };
}

describe('CreateStation under the Station Limit', () => {
  it('creates the first Station and emits STATION_CREATED', async () => {
    const { repository, store, useCase } = harness(0);

    const result = await useCase.execute(command, ctx());

    expect(result.success).toBe(true);
    expect(repository.saved).toHaveLength(1);
    expect(store.events.map((e) => e.eventType)).toEqual(['STATION_CREATED']);
  });

  it('refuses the second with LIMIT_REACHED, saving nothing and emitting nothing', async () => {
    const { repository, store, useCase } = harness(1);

    const result = await useCase.execute(command, ctx());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('LIMIT_REACHED');
      expect(result.error.details).toMatchObject({ limit: 'station_count', value: 1, used: 1 });
    }
    expect(repository.saved).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('locks the Organization before deciding', async () => {
    const { capacity, useCase } = harness(0);

    await useCase.execute(command, ctx());

    expect(capacity.locked).toBe(1);
  });

  it('checks capacity only after the command validates', async () => {
    // An invalid command is rejected on its own terms; no point taking a lock.
    const { capacity, useCase } = harness(0);

    const result = await useCase.execute({ name: '', code: '' }, ctx());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(capacity.locked).toBe(0);
  });
});
