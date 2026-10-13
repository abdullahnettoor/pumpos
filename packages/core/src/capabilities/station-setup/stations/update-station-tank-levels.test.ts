import { describe, expect, it } from 'vitest';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { UpdateStation, type Station } from './index.js';

/**
 * Tank-level thresholds (#520) decide when every screen calls a tank low or
 * critical, so only an Owner or Manager may change them. Enforced in the
 * use-case so every caller is covered, not one route.
 */

const station = (settings: Record<string, unknown> = {}): Station => ({
  id: 'st-1',
  organizationId: 'org-1',
  name: 'Main',
  code: 'MAIN',
  address: null,
  phone: null,
  settings,
  onboardingStatus: 'READY_FOR_OPERATIONS',
  isActive: true,
  createdAt: '',
  updatedAt: '',
});

class Repo {
  saved: Station[] = [];
  constructor(readonly row: Station) {}
  async findById(id: string) {
    return id === this.row.id ? this.row : null;
  }
  async save(s: Station) {
    this.saved.push(s);
  }
  async listByOrganization() {
    return [this.row];
  }
  async delete() {}
}

/** `role: undefined` = no actor snapshot (a system caller). */
const ctx = (role?: string): ExecutionContext => ({
  organizationId: 'org-1',
  stationId: null,
  businessDayId: null,
  actorId: 'u',
  correlationId: null,
  ...(role === undefined
    ? {}
    : { actorSnapshot: { kind: 'tenant_user' as const, displayName: 'Someone', role } }),
  clock: new FixedClock(new Date('2026-10-13T10:00:00Z')),
  ids: new SequentialIdGenerator('id'),
});

function harness(settings: Record<string, unknown> = {}) {
  const repo = new Repo(station(settings));
  const store = new InMemoryEventStore();
  const useCase = new UpdateStation({
    repository: repo as never,
    events: new InProcessEventDispatcher({ store }),
  });
  return { repo, store, useCase };
}

const thresholds = { criticalBelowPct: 15, lowBelowPct: 35 };

describe('UpdateStation tank-level thresholds (#520)', () => {
  it.each(['Owner', 'Manager'])('lets a %s change them', async (role) => {
    const { repo, store, useCase } = harness({ shift_grace_minutes: 15 });
    const result = await useCase.execute(
      { id: 'st-1', settings: { shift_grace_minutes: 15, tankLevels: thresholds } },
      ctx(role),
    );
    expect(result.success).toBe(true);
    expect(repo.saved[0]?.settings.tankLevels).toEqual(thresholds);
    expect(store.events.map((e) => e.eventType)).toEqual([BusinessEvents.STATION_UPDATED]);
  });

  it.each(['Accountant', 'Staff', 'Attendant'])('refuses a %s', async (role) => {
    const { repo, useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: thresholds } },
      ctx(role),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(repo.saved).toHaveLength(0);
  });

  it('lets anyone save other settings that carry the thresholds unchanged', async () => {
    const { repo, useCase } = harness({ tankLevels: thresholds, fuel_brand: null });
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: { ...thresholds }, fuel_brand: 'IOCL' } },
      ctx('Accountant'),
    );
    expect(result.success).toBe(true);
    expect(repo.saved[0]?.settings.fuel_brand).toBe('IOCL');
  });

  it('refuses removing the thresholds without the right', async () => {
    const { useCase } = harness({ tankLevels: thresholds });
    const result = await useCase.execute({ id: 'st-1', settings: {} }, ctx('Staff'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('rejects thresholds where critical is not below low', async () => {
    const { repo, useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: { criticalBelowPct: 40, lowBelowPct: 40 } } },
      ctx('Owner'),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.saved).toHaveLength(0);
  });

  it('lets a system caller (no tenant user) change them', async () => {
    const { useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: thresholds } },
      ctx(),
    );
    expect(result.success).toBe(true);
  });
});
