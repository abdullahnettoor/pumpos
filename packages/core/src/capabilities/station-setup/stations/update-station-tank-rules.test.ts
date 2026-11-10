import { describe, expect, it } from 'vite-plus/test';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { UpdateStationTankRules, type Station } from './index.js';

/** Tank rules (#690): `station.tankLevels` alone, only its two keys written. */

const STORED = {
  shift_grace_minutes: 15,
  report_config: { paper: 'A4' },
  tankLevels: { criticalBelowPct: 25, lowBelowPct: 40 },
};

class Repo {
  patches: Array<Record<string, unknown>> = [];
  row: Station = {
    id: 'st-1',
    organizationId: 'org-1',
    name: 'Main',
    code: 'MAIN',
    address: null,
    phone: null,
    settings: STORED,
    onboardingStatus: 'READY_FOR_OPERATIONS',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  async lockForUpdate(id: string, organizationId: string) {
    return id === this.row.id && organizationId === this.row.organizationId ? this.row : null;
  }
  async patchSettings(_id: string, _org: string, patch: Record<string, unknown>) {
    this.patches.push(patch);
    this.row = { ...this.row, settings: { ...this.row.settings, ...patch } };
    return this.row;
  }
}

const ctx = (permissions: readonly string[], org = 'org-1'): ExecutionContext => ({
  organizationId: org,
  stationId: null,
  businessDayId: null,
  actorId: 'u',
  correlationId: null,
  actorSnapshot: { kind: 'tenant_user' as const, displayName: 'Someone', role: 'Manager' },
  permissions: new Set(permissions),
  clock: new FixedClock(new Date('2026-10-13T10:00:00Z')),
  ids: new SequentialIdGenerator('id'),
});

function harness() {
  const repo = new Repo();
  const store = new InMemoryEventStore();
  const useCase = new UpdateStationTankRules({
    repository: repo as never,
    events: new InProcessEventDispatcher({ store }),
  });
  return { repo, store, useCase };
}

const NEW_LEVELS = { criticalBelowPct: 10, lowBelowPct: 30 };

describe('UpdateStationTankRules (#690)', () => {
  it('changes only the submitted keys and leaves every other setting untouched', async () => {
    const { repo, store, useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: NEW_LEVELS, stock_variance_tolerance_pct: 1 } },
      ctx(['station.tankLevels']),
    );
    expect(result.success).toBe(true);
    expect(repo.row.settings).toEqual({
      ...STORED,
      tankLevels: NEW_LEVELS,
      stock_variance_tolerance_pct: 1,
    });
    expect(store.events).toHaveLength(1);
    expect(store.events[0]?.payload).toMatchObject({
      stationId: 'st-1',
      tankLevels: { before: STORED.tankLevels, after: NEW_LEVELS },
      stockVarianceTolerancePct: { before: 0.5, after: 1 },
    });
  });

  it('patches the limit alone without touching the thresholds', async () => {
    const { repo, useCase } = harness();
    await useCase.execute(
      { id: 'st-1', settings: { stock_variance_tolerance_pct: 2 } },
      ctx(['station.tankLevels']),
    );
    expect(repo.patches).toEqual([{ stock_variance_tolerance_pct: 2 }]);
  });

  it('refuses without station.tankLevels, even with station.manage', async () => {
    const { repo, store, useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: NEW_LEVELS } },
      ctx(['pages.station', 'station.manage']),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(repo.patches).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('treats another Organization’s Station as not found', async () => {
    const { repo, useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: NEW_LEVELS } },
      ctx(['station.tankLevels'], 'org-2'),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    expect(repo.patches).toHaveLength(0);
  });

  it.each([
    { shift_grace_minutes: 1 },
    { tankLevels: NEW_LEVELS, report_config: {} },
    {},
    { tankLevels: { criticalBelowPct: 50, lowBelowPct: 40 } },
    { stock_variance_tolerance_pct: 6 },
  ])('rejects %j', async (settings) => {
    const { repo, useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings } as never,
      ctx(['station.tankLevels']),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.patches).toHaveLength(0);
  });

  it('writes and emits nothing when the values are unchanged', async () => {
    const { repo, store, useCase } = harness();
    const result = await useCase.execute(
      { id: 'st-1', settings: { tankLevels: STORED.tankLevels } },
      ctx(['station.tankLevels']),
    );
    expect(result.success).toBe(true);
    expect(repo.patches).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });
});
