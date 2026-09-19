import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AccessDocument, Role } from '@pump/shared';
import { accessRouter } from './access.js';

/**
 * `GET /access` is the only way a client learns what its Organization may use,
 * and the filtering that keeps commercial detail away from Staff and
 * Attendants happens here, on the server. These tests drive the real route
 * against a fake DB returning the Organization row and its Station count.
 */

function makeFakeDb(rows: any[][]) {
  return {
    select: () => {
      const result = rows.shift() ?? [];
      const builder: any = {
        from: () => builder,
        where: () => builder,
        then: (resolve: (v: any[]) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  };
}

const organizationRow = (over: Record<string, unknown> = {}) => ({
  subscriptionPlan: 'CORE',
  subscriptionStatus: 'ACTIVE',
  accessUntil: null,
  ...over,
});

async function getAccess(
  role: Role,
  { organization = organizationRow(), stationCount = 1 } = {},
): Promise<AccessDocument> {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  const db = makeFakeDb([[organization], [{ value: stationCount }]]);
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'someone@example.com',
      fullName: 'Someone',
      organizationId: 'org-1',
      role,
      assignedStationIds: [],
    });
    await next();
  });
  app.route('/access', accessRouter);

  const res = await app.request('/access');
  expect(res.status).toBe(200);
  const body = (await res.json()) as { success: boolean; data: AccessDocument };
  expect(body.success).toBe(true);
  return body.data;
}

describe('GET /access', () => {
  it('returns the CORE plan, Station usage and subscription to an Owner', async () => {
    const doc = await getAccess('Owner', { stationCount: 1 });
    expect(doc.plan).toBe('CORE');
    expect(doc.limits.station_count).toEqual({ value: 1, used: 1, reached: true });
    expect(doc.subscription).toEqual({
      status: 'ACTIVE',
      mode: 'NORMAL',
      accessUntil: null,
      showWarning: false,
      warningMessage: null,
    });
  });

  it('gives a Manager the same commercial view as an Owner', async () => {
    const doc = await getAccess('Manager', { stationCount: 0 });
    expect(doc.plan).toBe('CORE');
    expect(doc.limits.station_count.reached).toBe(false);
  });

  it.each<Role>(['Accountant', 'Staff', 'Attendant'])(
    'withholds the Product Plan key from %s',
    async (role) => {
      const doc = await getAccess(role);
      expect(doc.plan).toBeUndefined();
      expect(Object.values(doc.capabilities).every((entry) => entry.enabled)).toBe(true);
    },
  );

  it('counts every Station row against the Limit, inactive ones included', async () => {
    const doc = await getAccess('Owner', { stationCount: 3 });
    expect(doc.limits.station_count).toEqual({ value: 1, used: 3, reached: true });
  });

  it('normalizes a legacy stored subscription value', async () => {
    const doc = await getAccess('Owner', {
      organization: organizationRow({ subscriptionPlan: 'Core', subscriptionStatus: 'Revoked' }),
    });
    expect(doc.plan).toBe('CORE');
    expect(doc.subscription.status).toBe('SUSPENDED');
    expect(doc.subscription.mode).toBe('SUSPENDED');
  });

  it('serializes the paid-through instant as an ISO string', async () => {
    const doc = await getAccess('Owner', {
      organization: organizationRow({ accessUntil: new Date('2026-10-01T00:00:00.000Z') }),
    });
    expect(doc.subscription.accessUntil).toBe('2026-10-01T00:00:00.000Z');
  });
});
