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
    id: 'st-1',
    organizationId: 'org-1',
    name: 'Station',
    code: 'ST1',
    address: null,
    phone: null,
    settings: { report_config: STORED_CONFIG },
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

function appAs(role: string) {
  const { db, writes } = fakeDb();
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'u@example.com',
      fullName: 'User',
      organizationId: 'org-1',
      role,
      assignedStationIds: ['st-1'],
    });
    await next();
  });
  app.route('/setup', stationSetupRouter);
  return { app, writes };
}

const changedConfig = {
  settings: { report_config: { shiftSummary: ['header'], paper: 'LETTER', showLogo: false } },
};

const put = (app: Hono<any>) =>
  app.request('/setup/stations/st-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changedConfig),
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
