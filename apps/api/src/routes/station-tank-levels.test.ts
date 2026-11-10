import { describe, expect, it } from 'vite-plus/test';
import { Hono } from 'hono';
import { schema } from '@pump/db';
import { stationSetupRouter } from './station-setup.js';

/**
 * Tank rules (#690): `PUT /setup/stations/:id/tank-levels` is authorized by the
 * effective `station.tankLevels` Permission (ADR 0013) plus Station assignment,
 * never `station.manage`, and writes only its two settings keys.
 */

const STATION = '7c1b2a40-5e0d-4f6a-9b1e-3a2d4c5e6f70';
const OTHER_STATION = '9d2c3b51-6f1e-4a7b-8c2f-4b3e5d6f7a81';

const STORED = {
  shift_grace_minutes: 15,
  report_config: { paper: 'A4' },
  tankLevels: { criticalBelowPct: 25, lowBelowPct: 40 },
};

function fakeDb() {
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
    id: STATION,
    organizationId: 'org-1',
    name: 'Station',
    code: 'ST1',
    address: null,
    phone: null,
    settings: STORED,
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
        writes.push({ kind: 'insert', ...v });
        return chain(() => [{ id: 'row-1' }]);
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        writes.push({ kind: 'update', ...v });
        return chain(() => [stationRow]);
      },
    }),
    delete: () => chain(() => []),
    execute: async () => [],
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { db, writes };
}

function appAs(user: Record<string, unknown>) {
  const { db, writes } = fakeDb();
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'u@example.com',
      fullName: 'User',
      organizationId: 'org-1',
      role: 'Manager',
      assignedStationIds: [STATION],
      ...user,
    });
    await next();
  });
  app.route('/setup', stationSetupRouter);
  return { app, writes };
}

const put = (app: Hono<any>, body: unknown, id: string = STATION) =>
  app.request(`/setup/stations/${id}/tank-levels`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const CHANGE = { tankLevels: { criticalBelowPct: 10, lowBelowPct: 30 } };
const settingsWrites = (writes: Array<Record<string, unknown>>) =>
  writes.filter((w) => w.kind === 'update' && w.settings !== undefined);
const patchOf = (write: Record<string, unknown>) => {
  const chunks = (write.settings as any).queryChunks as unknown[];
  const json = chunks.find((c) => typeof c === 'string' && c.startsWith('{'));
  return JSON.parse(json as string);
};

// A Manager whose Owner removed `station.manage` but kept `station.tankLevels`.
const TANK_ONLY = ['pages.station', 'station.tankLevels'];
const MANAGE_ONLY = ['pages.station', 'station.manage'];

describe('PUT /setup/stations/:id/tank-levels (#690)', () => {
  it('saves for a user with station.tankLevels but not station.manage, writing only the patch', async () => {
    const { app, writes } = appAs({ permissions: TANK_ONLY });
    const res = await put(app, CHANGE);
    expect(res.status).toBe(200);
    const [write] = settingsWrites(writes);
    expect(Object.keys(write).sort()).toEqual(['kind', 'settings', 'updatedAt']);
    expect(patchOf(write)).toEqual(CHANGE);
    expect(writes.some((w) => w.kind === 'insert' && w.settings !== undefined)).toBe(false);
  });

  it('saves the tank variance limit alone', async () => {
    const { app, writes } = appAs({ permissions: TANK_ONLY });
    const res = await put(app, { stock_variance_tolerance_pct: 1.25 });
    expect(res.status).toBe(200);
    expect(patchOf(settingsWrites(writes)[0])).toEqual({ stock_variance_tolerance_pct: 1.25 });
  });

  it('refuses a user with neither Permission', async () => {
    const { app, writes } = appAs({ permissions: ['pages.station'] });
    const res = await put(app, CHANGE);
    expect(res.status).toBe(403);
    expect(settingsWrites(writes)).toHaveLength(0);
  });

  it('refuses station.manage without station.tankLevels: the thresholds are their own Permission', async () => {
    const { app, writes } = appAs({ permissions: MANAGE_ONLY });
    const res = await put(app, CHANGE);
    expect(res.status).toBe(403);
    expect(settingsWrites(writes)).toHaveLength(0);
  });

  it('answers a malformed id with VALIDATION_ERROR before any query', async () => {
    const { app, writes } = appAs({ permissions: TANK_ONLY });
    const res = await put(app, CHANGE, 'not-a-uuid');
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe('VALIDATION_ERROR');
    expect(writes).toHaveLength(0);
  });

  it('refuses a Station the user is not assigned to', async () => {
    const { app, writes } = appAs({ permissions: TANK_ONLY, assignedStationIds: [OTHER_STATION] });
    const res = await put(app, CHANGE);
    expect(res.status).toBe(403);
    expect(settingsWrites(writes)).toHaveLength(0);
  });

  it('rejects unknown keys, an empty body and invalid values without writing', async () => {
    const writesSeen: Array<Record<string, unknown>> = [];
    for (const body of [
      { ...CHANGE, shift_grace_minutes: 99 },
      { report_config: {} },
      {},
      { tankLevels: { criticalBelowPct: 50, lowBelowPct: 40 } },
      { stock_variance_tolerance_pct: 9 },
    ]) {
      const { app, writes } = appAs({ permissions: TANK_ONLY });
      const res = await put(app, body);
      expect(res.status).toBe(400);
      writesSeen.push(...writes);
    }
    expect(settingsWrites(writesSeen)).toHaveLength(0);
  });
});

describe('PUT /setup/stations/:id keeps its station.manage rule (#690)', () => {
  const putStation = (app: Hono<any>, body: unknown) =>
    app.request(`/setup/stations/${STATION}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('still refuses a tankLevels-only user', async () => {
    const { app, writes } = appAs({ permissions: TANK_ONLY });
    const res = await putStation(app, { settings: CHANGE });
    expect(res.status).toBe(403);
    expect(writes.some((w) => w.settings !== undefined)).toBe(false);
  });

  it('still saves for a user with both', async () => {
    const { app } = appAs({ permissions: [...TANK_ONLY, 'station.manage'] });
    const res = await putStation(app, { settings: CHANGE });
    expect(res.status).toBe(200);
  });
});
