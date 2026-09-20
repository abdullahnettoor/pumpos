import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { declareWritePolicies } from '@pump/core';
import { writePolicyGuard } from './write-policy-guard.js';

/**
 * The guard at the HTTP boundary. It resolves the Organization's access mode
 * from current database state on every request — so a lapsed grace period
 * bites on the next call, and a confirmed payment restores writes at once —
 * and renders the refusal in the standard envelope.
 *
 * Adoption is per route family (#168-#171); this proves the mechanism a
 * family gets when it opts in.
 */

const registry = declareWritePolicies([
  {
    operation: 'POST /shifts/close',
    restricted: 'FINISH_OPEN_WORK',
    rationale: 'The open day has to be closable.',
  },
  {
    operation: 'POST /setup/stations',
    restricted: 'BLOCKED',
    rationale: 'Growth stops under Restricted Access.',
  },
]);

/** Serves the access reader's four reads from one subscription state. */
function fakeDb(state: { status: string; accessUntil: string | null }) {
  let queue: unknown[][] = [];
  return {
    select() {
      if (queue.length === 0) {
        queue = [
          [
            {
              subscriptionPlan: 'CORE',
              subscriptionStatus: state.status,
              accessUntil: state.accessUntil ? new Date(state.accessUntil) : null,
            },
          ],
          [{ value: 1 }],
          [],
          [],
        ];
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

async function call(
  operation: string,
  state: { status: string; accessUntil?: string | null },
): Promise<{ status: number; body: any; handled: boolean }> {
  let handled = false;
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', fakeDb({ status: state.status, accessUntil: state.accessUntil ?? null }));
    c.set('user', { organizationId: 'org-1', role: 'Owner' });
    await next();
  });
  app.post('/x', writePolicyGuard(operation, { registry }), (c) => {
    handled = true;
    return c.json({ success: true, data: {} });
  });

  const res = await app.request('/x', { method: 'POST' });
  return { status: res.status, body: await res.json(), handled };
}

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

describe('writePolicyGuard', () => {
  it('lets a blocked operation through while the subscription is healthy', async () => {
    const result = await call('POST /setup/stations', { status: 'ACTIVE' });

    expect(result.status).toBe(200);
    expect(result.handled).toBe(true);
  });

  it('still allows growth during the Payment Grace Period', async () => {
    // PAST_DUE inside its window is NORMAL: one failed payment must not
    // interrupt the business the same day.
    const result = await call('POST /setup/stations', {
      status: 'PAST_DUE',
      accessUntil: future(),
    });

    expect(result.status).toBe(200);
  });

  it('blocks growth once the grace period has lapsed, with no job involved', async () => {
    const result = await call('POST /setup/stations', { status: 'PAST_DUE', accessUntil: past() });

    expect(result.status).toBe(403);
    expect(result.handled).toBe(false);
    expect(result.body.error.code).toBe('SUBSCRIPTION_RESTRICTED');
    expect(result.body.error.details).toMatchObject({
      operation: 'POST /setup/stations',
      resolution: 'COMPLETE_PAYMENT',
    });
  });

  it('still lets the day be closed after the grace period lapses', async () => {
    const result = await call('POST /shifts/close', { status: 'PAST_DUE', accessUntil: past() });

    expect(result.status).toBe(200);
    expect(result.handled).toBe(true);
  });

  it('refuses even closing work while the Organization is suspended', async () => {
    const result = await call('POST /shifts/close', { status: 'SUSPENDED' });

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('ORGANIZATION_SUSPENDED');
    expect(result.handled).toBe(false);
  });

  it('refuses to wire an undeclared operation at all', () => {
    // A wiring-time throw, not a per-request surprise: there is no defensible
    // default for an operation nobody classified.
    expect(() => writePolicyGuard('POST /setup/mystery', { registry })).toThrow(
      /No write-policy declaration/,
    );
  });
});
