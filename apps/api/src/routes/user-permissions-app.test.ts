import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sign } from 'hono/jwt';
import { schema } from '@pump/db';
import { IDEMPOTENCY_KEY_REUSED } from '@pump/shared';

/**
 * Per-user Permission changes through the real app (#553): JWT auth, the
 * idempotency middleware, the write-policy guard, the capability guard, the
 * handler and the use-case, in the order `index.ts` mounts them. Only the
 * database is fake.
 */

const ORG_ID = 'org-1';
const SECRET = 'test-secret-for-hs256-only';
const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_SECRET: SECRET,
  SUPABASE_DIRECT_URL: 'postgres://fake',
};
const TARGET = 'user-2';

const state = {
  actorRole: 'Owner',
  subscriptionStatus: 'ACTIVE',
  grants: ['permissions.custom'] as string[],
  targetRole: 'Manager',
  changes: null as null | { granted: string[]; revoked: string[] },
  changeWrites: 0,
  idempotencyKey: null as Record<string, unknown> | null,
  events: [] as Array<Record<string, any>>,
  evicted: [] as string[],
};

function chain(result: () => unknown[]) {
  const link = {
    from: () => link,
    where: () => link,
    limit: () => link,
    orderBy: () => link,
    for: () => link,
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
      Promise.resolve().then(result).then(resolve, reject),
  };
  return link;
}

const dateOf = new Date('2026-01-01T00:00:00.000Z');

function selectFrom(table: unknown): unknown[] {
  if (table === schema.organizations) {
    return [
      {
        subscriptionPlan: 'CORE',
        subscriptionStatus: state.subscriptionStatus,
        accessUntil: null,
        suspendedAt: null,
        isDemo: false,
      },
    ];
  }
  if (table === schema.stations) return [{ value: 1 }];
  if (table === schema.organizationCapabilityGrants) {
    return state.grants.map((capabilityKey) => ({ capabilityKey }));
  }
  if (table === schema.users) {
    return [
      {
        id: TARGET,
        organizationId: ORG_ID,
        authUserId: 'auth-target',
        fullName: 'Ravi',
        email: null,
        phone: null,
        role: state.targetRole,
        status: 'ACTIVE',
        createdAt: dateOf,
        updatedAt: dateOf,
      },
    ];
  }
  if (table === schema.userPermissionChanges) {
    return state.changes ? [{ organizationId: ORG_ID, ...state.changes }] : [];
  }
  if (table === schema.userStationAssignments) return [{ stationId: 's1' }];
  if (table === schema.idempotencyKeys) return state.idempotencyKey ? [state.idempotencyKey] : [];
  return [];
}

const fakeDb: Record<string, unknown> = {
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
  query: {
    users: {
      findFirst: async () => ({
        id: 'user-1',
        authUserId: 'auth-1',
        email: 'owner@example.com',
        fullName: 'Owner',
        organizationId: ORG_ID,
        role: state.actorRole,
        status: 'ACTIVE',
      }),
    },
  },
  execute: async () => [],
  select: () => ({ from: (table: unknown) => chain(() => selectFrom(table)) }),
  insert: (table: unknown) => ({
    values: (row: any) => ({
      then: (resolve: (v: unknown) => void) => {
        if (table === schema.events) state.events.push(...row);
        resolve(undefined);
      },
      onConflictDoUpdate: async () => {
        if (table === schema.userPermissionChanges) {
          state.changeWrites += 1;
          state.changes = { granted: row.granted, revoked: row.revoked };
        }
      },
      onConflictDoNothing: () => ({
        returning: async () => {
          if (state.idempotencyKey) return [];
          state.idempotencyKey = { ...row, id: 'key-1', responseStatus: null, responseBody: null };
          return [{ id: 'key-1' }];
        },
      }),
    }),
  }),
  update: (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if (table === schema.idempotencyKeys && state.idempotencyKey) {
          state.idempotencyKey = {
            ...state.idempotencyKey,
            responseStatus: Number(values.responseStatus),
            responseBody: values.responseBody,
          };
        }
        return { returning: async () => [], then: (r: (v: unknown) => void) => r(undefined) };
      },
    }),
  }),
  delete: (table: unknown) => ({
    where: async () => {
      if (table === schema.userPermissionChanges) {
        state.changeWrites += 1;
        state.changes = null;
      } else state.idempotencyKey = null;
    },
  }),
};

vi.mock('@pump/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pump/db')>()),
  createDb: () => fakeDb,
}));
vi.mock('../infra/auth-cache.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../infra/auth-cache.js')>();
  return {
    ...real,
    evictCachedAuthUser: (id: string | null | undefined) => {
      if (id) state.evicted.push(id);
      real.evictCachedAuthUser(id);
    },
  };
});

const { default: worker } = await import('../index.js');

async function bearer(sub: string) {
  return sign(
    {
      sub,
      iss: `${ENV.SUPABASE_URL}/auth/v1`,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    SECRET,
    'HS256',
  );
}

async function call(method: string, path: string, body?: unknown, key?: string, sub = 'auth-1') {
  const res = await worker.fetch(
    new Request(`https://api.example.com/api/setup/users/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await bearer(sub)}`,
        'Content-Type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    ENV,
  );
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const put = (body: unknown, key = 'k-1', sub?: string) =>
  call('PUT', `${TARGET}/permissions`, body, key, sub);

describe('Permission changes API (#553)', () => {
  beforeEach(() => {
    Object.assign(state, {
      actorRole: 'Owner',
      subscriptionStatus: 'ACTIVE',
      grants: ['permissions.custom'],
      targetRole: 'Manager',
      changes: null,
      changeWrites: 0,
      idempotencyKey: null,
      events: [],
      evicted: [],
    });
  });

  it('GET returns defaults, stored changes and the effective set', async () => {
    state.changes = { granted: [], revoked: ['purchases.viewCosts'] };
    const r = await call('GET', `${TARGET}/permissions`);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      userId: TARGET,
      role: 'Manager',
      editable: true,
      entitled: true,
      changes: { revoked: ['purchases.viewCosts'] },
    });
    expect(r.body.data.defaults).toContain('purchases.viewCosts');
    expect(r.body.data.effective).not.toContain('purchases.viewCosts');
  });

  it('PUT stores a normalised change, emits one event and evicts the auth cache', async () => {
    const r = await put({ revoked: ['purchases.viewCosts'] });
    expect(r.status).toBe(200);
    expect(r.body.data.changes).toEqual({ granted: [], revoked: ['purchases.viewCosts'] });
    expect(state.changes).toEqual({ granted: [], revoked: ['purchases.viewCosts'] });
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      eventType: 'USER_PERMISSIONS_CHANGED',
      aggregateType: 'User',
      aggregateId: TARGET,
      organizationId: ORG_ID,
      actorId: 'user-1',
      payload: {
        reason: 'EDITED',
        before: { changes: { granted: [], revoked: [] } },
        after: { changes: { revoked: ['purchases.viewCosts'] } },
      },
    });
    expect(state.evicted).toEqual(['auth-target']);
  });

  it('PUT replays a retried Idempotency-Key without writing again', async () => {
    const body = { revoked: ['purchases.viewCosts'] };
    const first = await put(body, 'k-idem');
    const retry = await put(body, 'k-idem');
    expect(retry).toEqual(first);
    expect(state.changeWrites).toBe(1);
    expect(state.events).toHaveLength(1);
    const reused = await put({ revoked: ['expenses.void'] }, 'k-idem');
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe(IDEMPOTENCY_KEY_REUSED);
  });

  it.each(['Manager', 'Accountant', 'Staff'])('PUT refuses a %s', async (role) => {
    state.actorRole = role;
    const r = await put({ revoked: ['purchases.viewCosts'] }, `k-${role}`, `auth-${role}`);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    expect(state.changeWrites).toBe(0);
    expect(state.events).toEqual([]);
  });

  it('PUT is refused without the Custom permissions capability', async () => {
    state.grants = [];
    const r = await put({ revoked: ['purchases.viewCosts'] }, 'k-cap');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CAPABILITY_NOT_ENTITLED');
    expect(state.changeWrites).toBe(0);
  });

  it('PUT is blocked under Restricted Access', async () => {
    state.subscriptionStatus = 'RESTRICTED';
    const r = await put({ revoked: ['purchases.viewCosts'] }, 'k-restricted');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('SUBSCRIPTION_RESTRICTED');
    expect(state.changeWrites).toBe(0);
  });

  it('PUT rejects never-delegable grants, unknown ids, Owner and Attendant targets', async () => {
    const never = await put({ granted: ['organization.edit'] }, 'k-n');
    expect(never.status).toBe(400);
    expect(never.body.error.code).toBe('VALIDATION_ERROR');
    state.idempotencyKey = null;
    const unknown = await put({ granted: ['nope.nothing'] }, 'k-u');
    expect(unknown.status).toBe(400);
    for (const role of ['Owner', 'Attendant']) {
      state.targetRole = role;
      state.idempotencyKey = null;
      const r = await put({ revoked: ['purchases.viewCosts'] }, `k-${role}`);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
    }
    expect(state.changeWrites).toBe(0);
    expect(state.events).toEqual([]);
  });

  it('PUT deletes the row when the request returns to the Role defaults', async () => {
    state.changes = { granted: [], revoked: ['purchases.viewCosts'] };
    const r = await put({}, 'k-reset');
    expect(r.status).toBe(200);
    expect(state.changes).toBeNull();
    expect(state.events).toHaveLength(1);
  });

  it('role-change preview lists the changes a Role change would drop, writing nothing', async () => {
    state.changes = { granted: [], revoked: ['purchases.viewCosts'] };
    const r = await call('GET', `${TARGET}/role-change-preview?role=Accountant`);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      userId: TARGET,
      fromRole: 'Manager',
      toRole: 'Accountant',
      droppedChanges: { granted: [], revoked: ['purchases.viewCosts'] },
    });
    expect(state.changes).not.toBeNull();
    const bad = await call('GET', `${TARGET}/role-change-preview?role=Wizard`);
    expect(bad.status).toBe(400);
  });

  it('applies a stored change on the very next request, without waiting for the auth cache', async () => {
    state.actorRole = 'Accountant';
    const bearerToken = await bearer('auth-acct');
    const days = async () =>
      (
        await worker.fetch(
          new Request('https://api.example.com/api/dssr/days?stationId=s1', {
            headers: { Authorization: `Bearer ${bearerToken}` },
          }),
          ENV,
        )
      ).status;
    expect(await days()).not.toBe(403);
    state.changes = { granted: [], revoked: ['reports.view'] };
    expect(await days()).toBe(403);
    state.changes = null;
    expect(await days()).not.toBe(403);
  });

  it('keeps profit & loss to View profit & loss, and a Manager only with a grant', async () => {
    state.actorRole = 'Manager';
    const pnl = async (sub: string) =>
      (
        await worker.fetch(
          new Request(
            'https://api.example.com/api/dssr/profit-loss?stationId=s1&from=2026-01-01&to=2026-01-31',
            {
              headers: { Authorization: `Bearer ${await bearer(sub)}` },
            },
          ),
          ENV,
        )
      ).status;
    expect(await pnl('auth-mgr')).toBe(403);
    state.changes = { granted: ['finance.viewProfitLoss'], revoked: [] };
    expect(await pnl('auth-mgr')).not.toBe(403);
  });
});
