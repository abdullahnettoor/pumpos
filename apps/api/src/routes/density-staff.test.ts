import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// The station clock is resolved right AFTER the role/station guard, so a 404
// from this stub proves the guard let the caller through (a refusal is 403).
vi.mock('../infra/station-clock.js', async (orig) => ({
  ...(await orig<typeof import('../infra/station-clock.js')>()),
  loadStationClock: async () => null,
}));

const { densityRouter } = await import('./density.js');

const ST = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ACCESS_READS = () => [
  [
    {
      subscriptionPlan: 'CORE',
      subscriptionStatus: 'ACTIVE',
      accessUntil: null,
      suspendedAt: null,
    },
  ],
  [{ value: 1 }],
  [],
  [],
];

function app(role: string, assigned: string[], write = false) {
  const reads = write ? ACCESS_READS() : [];
  const chain = (rows: unknown[]): any => {
    const c: any = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  const db = { select: () => chain(reads.shift() ?? []) };
  const a = new Hono<any>();
  a.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'u1',
      email: 'u@example.com',
      fullName: 'U',
      organizationId: 'org-1',
      role,
      assignedStationIds: assigned,
    });
    await next();
  });
  a.route('/transactions', densityRouter);
  return a;
}

const reading = {
  stationId: ST,
  productId: 'p1',
  kind: 'MORNING',
  entryMethod: 'DIRECT_15',
  density15: 745,
};
const post = (a: Hono<any>, body: unknown) =>
  a.request('/transactions/density/readings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('density register: Staff (#512)', () => {
  it('Staff can read /density/today and /density/readings for an assigned station', async () => {
    const a = app('Staff', [ST]);
    expect((await a.request(`/transactions/density/today?stationId=${ST}`)).status).toBe(404);
    expect((await a.request(`/transactions/density/readings?stationId=${ST}`)).status).toBe(404);
  });

  it('Staff can POST a density reading for an assigned station', async () => {
    expect((await post(app('Staff', [ST], true), reading)).status).toBe(404);
  });

  it('Staff are still refused a station they are not assigned to', async () => {
    const a = app('Staff', [OTHER]);
    expect((await a.request(`/transactions/density/today?stationId=${ST}`)).status).toBe(403);
  });

  it('Attendants remain refused', async () => {
    const a = app('Attendant', [ST]);
    expect((await a.request(`/transactions/density/today?stationId=${ST}`)).status).toBe(403);
  });
});
