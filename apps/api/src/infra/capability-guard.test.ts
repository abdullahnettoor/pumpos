import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AccessRegistry } from '@pump/core';
import { requireCapabilityGuard } from './capability-guard.js';

/**
 * The reusable API gate. What matters here is the wire contract an operator
 * and a client both depend on: HTTP 403, the stable
 * CAPABILITY_NOT_ENTITLED code, machine-readable resolution details — and
 * that the decision is made from current database state, not from whatever
 * the caller believes it is entitled to.
 */

const registry: AccessRegistry = {
  plans: { CORE: { key: 'CORE', capabilities: [], limits: { station_count: 1 } } },
  capabilities: {
    'exports.tally': {
      key: 'exports.tally',
      title: 'Tally export',
      unavailableMessage: 'Tally export is not available for this Organization.',
      resolution: 'CONTACT_PUMPOS',
      upgradable: true,
    },
  },
};

/**
 * Fake DB serving the reader's four reads (organization, stations, grants,
 * overrides) from a mutable grant list, so a test can revoke mid-session.
 */
function fakeDb(state: { grants: string[] }) {
  const responses = () => [
    [{ subscriptionPlan: 'CORE', subscriptionStatus: 'ACTIVE', accessUntil: null }],
    [{ value: 1 }],
    state.grants.map((capabilityKey) => ({ capabilityKey })),
    [],
  ];
  let queue: unknown[][] = [];
  return {
    reads: 0,
    select(this: { reads: number }) {
      if (queue.length === 0) {
        queue = responses();
        this.reads += 1;
      }
      const rows = queue.shift() ?? [];
      const builder: any = {
        from: () => builder,
        where: () => builder,
        then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(rows).then(resolve, reject),
      };
      return builder;
    },
  };
}

function makeApp(db: unknown) {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: 'org-1',
      role: 'Owner',
      assignedStationIds: [],
    });
    await next();
  });
  app.post('/exports/tally', requireCapabilityGuard('exports.tally', { registry }), (c) =>
    c.json({ success: true, data: { exported: true } }),
  );
  return app;
}

describe('requireCapabilityGuard', () => {
  it('lets an entitled Organization through to the handler', async () => {
    const res = await makeApp(fakeDb({ grants: ['exports.tally'] })).request('/exports/tally', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { exported: true } });
  });

  it('rejects with 403, the stable code and safe resolution details', async () => {
    const res = await makeApp(fakeDb({ grants: [] })).request('/exports/tally', { method: 'POST' });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: 'CAPABILITY_NOT_ENTITLED',
        message: 'Tally export is not available for this Organization.',
        details: {
          capability: 'exports.tally',
          resolution: 'CONTACT_PUMPOS',
          actionLabel: 'Contact PumpOS',
        },
      },
    });
  });

  it('does not run the handler when access is refused', async () => {
    let handled = false;
    const app = new Hono<{ Variables: { db: any; user: any } }>();
    app.use('*', async (c, next) => {
      c.set('db', fakeDb({ grants: [] }));
      c.set('user', { organizationId: 'org-1', role: 'Owner' });
      await next();
    });
    app.post('/exports/tally', requireCapabilityGuard('exports.tally', { registry }), (c) => {
      handled = true;
      return c.json({ success: true, data: {} });
    });

    await app.request('/exports/tally', { method: 'POST' });

    expect(handled).toBe(false);
  });

  it('refuses a stale client whose grant was revoked between requests', async () => {
    // One long-lived client, one database whose grant disappears underneath it.
    const state = { grants: ['exports.tally'] };
    const app = makeApp(fakeDb(state));

    const before = await app.request('/exports/tally', { method: 'POST' });
    state.grants = [];
    const after = await app.request('/exports/tally', { method: 'POST' });

    expect(before.status).toBe(200);
    expect(after.status).toBe(403);
  });

  it('refuses a key the shipped registry does not define', async () => {
    const app = new Hono<{ Variables: { db: any; user: any } }>();
    app.use('*', async (c, next) => {
      c.set('db', fakeDb({ grants: ['exports.unbuilt'] }));
      c.set('user', { organizationId: 'org-1', role: 'Owner' });
      await next();
    });
    app.post('/x', requireCapabilityGuard('exports.unbuilt'), (c) =>
      c.json({ success: true, data: {} }),
    );

    const res = await app.request('/x', { method: 'POST' });

    expect(res.status).toBe(403);
  });
});
