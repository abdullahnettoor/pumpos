import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { platformAccessRouter } from './platform-access.js';

/**
 * The platform access routes are the only way Organization Entitlements and
 * Limits change, so the contract worth pinning here is what reaches the
 * database and what comes back: a rejected key writes nothing, a repeated
 * command reports `changed: false`, and a real change commits inside one
 * transaction alongside its event.
 */

interface Write {
  table: string;
  values?: unknown;
}

function tableName(table: unknown): string {
  const nameSymbol = Object.getOwnPropertySymbols(table as object).find(
    (symbol) => symbol.description === 'drizzle:Name',
  );
  return nameSymbol ? String((table as Record<symbol, unknown>)[nameSymbol]) : 'unknown';
}

const chainable = (rows: unknown[]): any => {
  const target: Record<string, unknown> = {
    returning: () => Promise.resolve(rows),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  const proxy: unknown = new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      return () => proxy;
    },
  });
  return proxy;
};

/**
 * Fake DB whose writes only land in `committed` when the transaction returns,
 * so a rolled-back command is observably a no-op.
 */
function fakeDb(selectRows: unknown[][], committed: Write[]) {
  const row = (values: unknown) => ({
    id: 'row-1',
    organizationId: 'org-1',
    capabilityKey: 'exports.tally',
    limitKey: 'station_count',
    value: 3,
    grantedByEmail: 'admin@pumpos.app',
    assignedByEmail: 'admin@pumpos.app',
    grantedBySubject: null,
    assignedBySubject: null,
    reason: null,
    createdAt: new Date('2026-09-19T08:00:00.000Z'),
    revokedAt: null,
    revokedByEmail: null,
    revokedBySubject: null,
    ...(values as Record<string, unknown>),
  });

  const client = (sink: Write[]) => ({
    select: () => chainable(selectRows.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        sink.push({ table: tableName(table), values });
        return chainable([row(values)]);
      },
    }),
    update: (table: unknown) => {
      sink.push({ table: tableName(table) });
      return chainable([row({ revokedAt: new Date('2026-09-19T09:00:00.000Z') })]);
    },
    execute: async () => [],
  });

  return {
    ...client(committed),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const draft: Write[] = [];
      const result = await run(client(draft));
      committed.push(...draft);
      return result;
    },
  };
}

function makeApp(db: unknown) {
  const app = new Hono<{ Variables: { db: any; platformAdmin: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('platformAdmin', { email: 'admin@pumpos.app', subjectId: 'auth-1' });
    await next();
  });
  app.route('/organizations', platformAccessRouter);
  return app;
}

async function call(
  db: unknown,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const res = await makeApp(db).request(path, {
    method,
    ...(body
      ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  });
  return { status: res.status, body: await res.json() };
}

describe('POST /platform/organizations/:orgId/capabilities', () => {
  it('rejects a capability key this build does not implement, writing nothing', async () => {
    const committed: Write[] = [];
    const { status, body } = await call(
      fakeDb([], committed),
      'POST',
      '/organizations/org-1/capabilities',
      { capabilityKey: 'exports.unbuilt' },
    );

    expect(status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    });
    expect(committed).toEqual([]);
  });

  // The idempotent "already granted" path cannot be reached through the route
  // while the production registry is empty (every key is rejected first); it is
  // covered against a test registry in administer-access.test.ts.
});

describe('PUT /platform/organizations/:orgId/limits/:key', () => {
  it('writes the override and its event in one transaction', async () => {
    const committed: Write[] = [];
    // First select: no active override.
    const { status, body } = await call(
      fakeDb([[]], committed),
      'PUT',
      '/organizations/org-1/limits/station_count',
      { value: 3, reason: 'Three-site contract' },
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.changed).toBe(true);
    expect(committed.map((w) => w.table)).toEqual(['organization_limit_overrides', 'events']);
  });

  it('refuses an override without a reason and writes nothing', async () => {
    const committed: Write[] = [];
    const { status, body } = await call(
      fakeDb([[]], committed),
      'PUT',
      '/organizations/org-1/limits/station_count',
      { value: 3 },
    );

    expect(status).toBe(400);
    expect(body.error.message).toMatch(/reason is required/i);
    expect(committed).toEqual([]);
  });

  it('refuses a non-positive value', async () => {
    const committed: Write[] = [];
    const { status } = await call(
      fakeDb([[]], committed),
      'PUT',
      '/organizations/org-1/limits/station_count',
      { value: 0, reason: 'why' },
    );

    expect(status).toBe(400);
    expect(committed).toEqual([]);
  });

  it('refuses an unknown Limit key', async () => {
    const committed: Write[] = [];
    const { status } = await call(
      fakeDb([[]], committed),
      'PUT',
      '/organizations/org-1/limits/user_count',
      { value: 5, reason: 'why' },
    );

    expect(status).toBe(400);
    expect(committed).toEqual([]);
  });
});

describe('DELETE /platform/organizations/:orgId/limits/:key', () => {
  it('is a no-op when no override is active', async () => {
    const committed: Write[] = [];
    const { status, body } = await call(
      fakeDb([[]], committed),
      'DELETE',
      '/organizations/org-1/limits/station_count',
    );

    expect(status).toBe(200);
    expect(body.data).toEqual({ changed: false, record: null });
    expect(committed).toEqual([]);
  });
});
