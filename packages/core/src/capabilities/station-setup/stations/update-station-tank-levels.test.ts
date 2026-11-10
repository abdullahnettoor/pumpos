import { describe, expect, it } from 'vite-plus/test';
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

describe('UpdateStation tank variance limit (#684)', () => {
  it.each(['Owner', 'Manager'])('lets a %s change it and records the change', async (role) => {
    const { repo, store, useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings: { stock_variance_tolerance_pct: 0.25 } },
      ctx(role),
    );
    expect(result.success).toBe(true);
    expect(repo.saved[0]?.settings.stock_variance_tolerance_pct).toBe(0.25);
    expect(store.events[0]?.payload).toMatchObject({
      stationId: 'st-1',
      stockVarianceTolerancePct: { before: 0.5, after: 0.25 },
    });
  });

  it.each(['Accountant', 'Staff', 'Attendant'])(
    'refuses a change by %s without saving',
    async (role) => {
      const { repo, store, useCase } = harness();
      const result = await useCase.execute(
        { id: 'st-1', settings: { stock_variance_tolerance_pct: 1 } },
        ctx(role),
      );
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
      expect(repo.saved).toHaveLength(0);
      expect(store.events).toHaveLength(0);
    },
  );

  it('lets system actors change it', async () => {
    const { useCase } = harness();
    expect(
      (await useCase.execute({ id: 'st-1', settings: { stock_variance_tolerance_pct: 1 } }, ctx()))
        .success,
    ).toBe(true);
  });

  it.each([-0.1, 5.01, 0.005, 'abc', null])('rejects invalid limit %s', async (value) => {
    const { repo, useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings: { stock_variance_tolerance_pct: value } },
      ctx('Owner'),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.saved).toHaveLength(0);
  });

  it('leaves untouched and equal limits alone for a user without the permission', async () => {
    const { repo, store, useCase } = harness({ stock_variance_tolerance_pct: 1 });
    expect(
      (await useCase.execute({ id: 'st-1', settings: { fuel_brand: 'IOCL' } }, ctx('Accountant')))
        .success,
    ).toBe(true);
    expect(repo.saved[0]?.settings.stock_variance_tolerance_pct).toBe(1);
    expect(store.events[0]?.payload).toEqual({ stationId: 'st-1' });
    expect(
      (
        await useCase.execute(
          { id: 'st-1', settings: { stock_variance_tolerance_pct: 1 } },
          ctx('Accountant'),
        )
      ).success,
    ).toBe(true);
  });
});

class Repo {
  saved: Station[] = [];
  constructor(readonly row: Station) {}
  async findById(id: string, organizationId: string) {
    return id === this.row.id && organizationId === this.row.organizationId ? this.row : null;
  }
  async lockForUpdate(id: string, organizationId: string) {
    return this.findById(id, organizationId);
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
const ctx = (role?: string, permissions?: readonly string[]): ExecutionContext => ({
  organizationId: 'org-1',
  stationId: null,
  businessDayId: null,
  actorId: 'u',
  correlationId: null,
  ...(role === undefined
    ? {}
    : { actorSnapshot: { kind: 'tenant_user' as const, displayName: 'Someone', role } }),
  ...(permissions ? { permissions: new Set(permissions) } : {}),
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

  it('treats a re-save with JSONB-reordered keys as unchanged', async () => {
    // Postgres JSONB returns keys in its own order; the client echoes them back.
    const { repo, useCase } = harness({ tankLevels: { lowBelowPct: 35, criticalBelowPct: 15 } });
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: { criticalBelowPct: 15, lowBelowPct: 35 } } },
      ctx('Accountant'),
    );
    expect(result.success).toBe(true);
    expect(repo.saved).toHaveLength(1);
  });

  it('treats explicit defaults over no thresholds as unchanged', async () => {
    const { useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: { lowBelowPct: 40, criticalBelowPct: 25 } } },
      ctx('Staff'),
    );
    expect(result.success).toBe(true);
  });

  it('refuses removing the thresholds without the right', async () => {
    const { useCase } = harness({ tankLevels: thresholds });
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: null } },
      ctx('Staff'),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('a partial General save preserves omitted tank rules without requiring their permission (#716)', async () => {
    const stored = {
      tankLevels: thresholds,
      stock_variance_tolerance_pct: 1.5,
      shift_grace_minutes: 15,
    };
    const { repo, useCase } = harness(stored);
    const result = await useCase.execute(
      {
        id: 'st-1',
        settings: {
          shift_grace_minutes: 30,
          timezone: 'Asia/Kolkata',
          business_day_starts_at: '06:00',
        },
      },
      ctx('Manager', ['station.manage']),
    );
    expect(result.success).toBe(true);
    expect(repo.saved[0]?.settings).toEqual({
      ...stored,
      shift_grace_minutes: 30,
      timezone: 'Asia/Kolkata',
      business_day_starts_at: '06:00',
    });
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

  it('follows the effective Permissions, not the Role defaults', async () => {
    const { useCase } = harness({ shift_grace_minutes: 15 });
    const refused = await useCase.execute(
      { id: 'st-1', settings: { shift_grace_minutes: 15, tankLevels: thresholds } } as never,
      ctx('Manager', ['station.manage']),
    );
    expect(refused.success).toBe(false);
  });
});
