import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { schema } from '@pump/db';
import { stationSetupRouter } from './station-setup.js';

/**
 * Report templates (#332): `settings.report_config` decides what prints for
 * every role, so only an Owner or Manager may change it through
 * `PUT /setup/stations/:id`. Others get 403 and nothing is written.
 */

const STORED_CONFIG = { shiftSummary: ['header', 'meta'], paper: 'A4', showLogo: true };

function fakeDb(stationSettings: Record<string, unknown> = { report_config: STORED_CONFIG }) {
  const writes: Array<Record<string, unknown>> = [];
  const accessReads: unknown[][] = [
    [
      {
        subscriptionPlan: 'CORE',
        subscriptionStatus: 'ACTIVE',
        accessUntil: null,
        suspendedAt: null,
      },
    ],
    [{ value: 1 }],
  ];
  let accessIndex = 0;
  const stationRow = {
    id: 'st-1',
    organizationId: 'org-1',
    name: 'Station',
    code: 'ST1',
    address: null,
    phone: null,
    settings: stationSettings,
    onboardingStatus: 'COMPLETED',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  const chain = (result: () => unknown[]): any => {
    const c: any = {
      from: (table: unknown) =>
        table === schema.stations ? chain(() => [stationRow]) : chain(result),
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      for: () => c,
      onConflictDoUpdate: () => c,
      onConflictDoNothing: () => c,
      returning: () => Promise.resolve(result()),
      then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return c;
  };
  const db: any = {
    select: () => chain(() => accessReads[accessIndex++] ?? []),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        writes.push(v);
        return chain(() => [{ id: 'row-1' }]);
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        writes.push(v);
        return chain(() => [{ id: 'row-1' }]);
      },
    }),
    delete: () => chain(() => []),
    execute: async () => [],
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { db, writes };
}

function appAs(
  role: string,
  assignedStationIds = ['st-1'],
  stationSettings?: Record<string, unknown>,
) {
  const { db, writes } = fakeDb(stationSettings);
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'u@example.com',
      fullName: 'User',
      organizationId: 'org-1',
      role,
      assignedStationIds,
    });
    await next();
  });
  app.route('/setup', stationSetupRouter);
  return { app, writes };
}

const changedConfig = {
  settings: { report_config: { shiftSummary: ['header'], paper: 'LETTER', showLogo: false } },
};

const put = (app: Hono<any>, body: Record<string, unknown> = changedConfig) =>
  app.request('/setup/stations/st-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const savedSettings = (writes: Array<Record<string, unknown>>) =>
  writes.find((w) => w.settings !== undefined && w.id === 'st-1')?.settings as any;

describe('PUT /setup/stations/:id report_config (#332)', () => {
  it.each(['Owner', 'Manager'])('lets %s save report templates', async (role) => {
    const { app, writes } = appAs(role);
    const res = await put(app);
    expect(res.status).toBe(200);
    expect(savedSettings(writes)?.report_config).toEqual(changedConfig.settings.report_config);
  });

  it.each(['Accountant', 'Staff'])('refuses %s and writes nothing', async (role) => {
    const { app, writes } = appAs(role);
    const res = await put(app);
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('FORBIDDEN');
    expect(savedSettings(writes)).toBeUndefined();
  });
});

describe('GET /setup/stations/:id/decantation-settings', () => {
  it('returns resolved defaults for an authorized station', async () => {
    const { app } = appAs('Manager');
    const response = await app.request('/setup/stations/st-1/decantation-settings');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        densityMethod: 'API_MPMS_11_1_ADJUNCT',
        densityToleranceKgM3: 3,
        quantityTolerance: 0.2,
        settlingTimeMinutes: 30,
        densitySpecBands: {},
      },
    });
  });

  it('does not expose settings for a station the user cannot access', async () => {
    const { app } = appAs('Staff', []);
    const response = await app.request('/setup/stations/st-1/decantation-settings');

    expect(response.status).toBe(403);
  });
});

describe('PUT /setup/stations/:id Decantation settings', () => {
  it.each(['Owner', 'Manager'])('lets %s save guidance settings', async (role) => {
    const { app, writes } = appAs(role);
    const settings = {
      densityMethod: 'OMC_TABLE_53B',
      densityToleranceKgM3: 4,
      quantityTolerance: 0.15,
      settlingTimeMinutes: 20,
      densitySpecBands: { 'product-1': { minKgM3: 815, maxKgM3: 845 } },
    };
    const response = await put(app, { settings });

    expect(response.status).toBe(200);
    expect(savedSettings(writes)).toMatchObject(settings);
  });

  it('rejects invalid guidance settings without writing', async () => {
    const { app, writes } = appAs('Manager');
    const response = await put(app, { settings: { densityToleranceKgM3: -1 } });

    expect(response.status).toBe(400);
    expect(savedSettings(writes)).toBeUndefined();
  });

  it('keeps guidance settings read-only for other roles', async () => {
    const { app, writes } = appAs('Accountant');
    const response = await put(app, { settings: { densityToleranceKgM3: 4 } });

    expect(response.status).toBe(403);
    expect(savedSettings(writes)).toBeUndefined();
  });
});

describe('PUT /setup/stations/:id tank levels (#520)', () => {
  const tankLevels = { criticalBelowPct: 15, lowBelowPct: 35 };

  it.each(['Owner', 'Manager'])('lets %s save tank-level thresholds', async (role) => {
    const { app, writes } = appAs(role);
    const response = await put(app, { settings: { tankLevels } });

    expect(response.status).toBe(200);
    expect(savedSettings(writes)?.tankLevels).toEqual(tankLevels);
  });

  it.each(['Accountant', 'Staff'])('refuses %s and writes nothing', async (role) => {
    const { app, writes } = appAs(role);
    const response = await put(app, { settings: { tankLevels } });

    expect(response.status).toBe(403);
    expect(((await response.json()) as any).error.code).toBe('FORBIDDEN');
    expect(savedSettings(writes)).toBeUndefined();
  });

  it('lets a re-save of other settings echo the stored thresholds in JSONB key order', async () => {
    const stored = { tankLevels: { lowBelowPct: 35, criticalBelowPct: 15 } };
    const { app, writes } = appAs('Manager', ['st-1'], stored);
    const response = await put(app, {
      name: 'Renamed',
      settings: { shift_grace_minutes: 20, tankLevels: { criticalBelowPct: 15, lowBelowPct: 35 } },
    });

    expect(response.status).toBe(200);
    expect(savedSettings(writes)?.shift_grace_minutes).toBe(20);
  });

  it('refuses an Accountant General Info save by write access, not by tank levels', async () => {
    // Accountants are read-only on this route today, so the tank-level edge
    // check never decides their request; the use-case covers a widened role.
    const stored = { tankLevels: { lowBelowPct: 35, criticalBelowPct: 15 } };
    const { app, writes } = appAs('Accountant', ['st-1'], stored);
    const response = await put(app, {
      name: 'Renamed',
      settings: { tankLevels: { criticalBelowPct: 15, lowBelowPct: 35 } },
    });

    expect(response.status).toBe(403);
    expect(((await response.json()) as any).error.message).toMatch(/write permissions/);
    expect(savedSettings(writes)).toBeUndefined();
  });

  it('rejects a critical threshold at or above low without writing', async () => {
    const { app, writes } = appAs('Owner');
    const response = await put(app, {
      settings: { tankLevels: { criticalBelowPct: 40, lowBelowPct: 30 } },
    });

    expect(response.status).toBe(400);
    expect(savedSettings(writes)).toBeUndefined();
  });
});
