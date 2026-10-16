import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sign } from 'hono/jwt';
import { schema } from '@pump/db';
import { IDEMPOTENCY_KEY_REUSED } from '@pump/shared';

/**
 * `PUT /api/organization` through the real app (#626): JWT auth, the
 * idempotency middleware, the write-policy guard and the handler, in the order
 * `index.ts` mounts them. Only the database is fake — `createDb` hands back an
 * in-memory stand-in that answers each table the request touches.
 */

const ORG_ID = 'org-1';
const AUTH_ID = 'auth-1';
const SECRET = 'test-secret-for-hs256-only';
const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_SECRET: SECRET,
  SUPABASE_DIRECT_URL: 'postgres://fake',
};

const ORGANIZATION = {
  id: ORG_ID,
  name: 'Sri Lakshmi Fuels',
  metadata: {},
  subscriptionPlan: 'CORE',
  subscriptionStatus: 'ACTIVE',
  accessUntil: null,
  isDemo: false,
  demoExpiresAt: null,
  suspendedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-01T00:00:00.000Z'),
};

interface StoredKey {
  id: string;
  requestPath: string;
  actorId: string | null;
  requestHash: string | null;
  responseStatus: number | null;
  responseBody: unknown;
}

/** What the fake database has seen; reset per test. */
const state = {
  subscriptionStatus: 'ACTIVE',
  organizationUpdates: 0,
  idempotencyKey: null as StoredKey | null,
};

/** A thenable query chain that resolves to `result` wherever it is awaited. */
function chain(result: () => unknown[]) {
  const link = {
    from: () => link,
    where: () => link,
    limit: () => link,
    orderBy: () => link,
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
      Promise.resolve().then(result).then(resolve, reject),
  };
  return link;
}

function selectFrom(table: unknown): unknown[] {
  if (table === schema.organizations) {
    return [{ ...ORGANIZATION, subscriptionStatus: state.subscriptionStatus }];
  }
  if (table === schema.stations) return [{ value: 1 }];
  if (table === schema.idempotencyKeys) return state.idempotencyKey ? [state.idempotencyKey] : [];
  return [];
}

const fakeDb = {
  query: {
    users: {
      findFirst: async () => ({
        id: 'user-1',
        authUserId: AUTH_ID,
        email: 'owner@example.com',
        fullName: 'Owner',
        organizationId: ORG_ID,
        role: 'Owner',
        status: 'ACTIVE',
      }),
    },
  },
  select: () => ({ from: (table: unknown) => chain(() => selectFrom(table)) }),
  insert: () => ({
    values: (row: Omit<StoredKey, 'id' | 'responseStatus' | 'responseBody'>) => ({
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
        return {
          returning: async () => {
            state.organizationUpdates += 1;
            return [{ ...ORGANIZATION, ...values }];
          },
          then: (resolve: (v: unknown) => void) => resolve(undefined),
        };
      },
    }),
  }),
  delete: () => ({
    where: async () => {
      state.idempotencyKey = null;
    },
  }),
};

vi.mock('@pump/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pump/db')>()),
  createDb: () => fakeDb,
}));

const { default: worker } = await import('../index.js');

async function bearer(): Promise<string> {
  return sign(
    {
      sub: AUTH_ID,
      iss: `${ENV.SUPABASE_URL}/auth/v1`,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    SECRET,
    'HS256',
  );
}

async function put(body: unknown, idempotencyKey: string) {
  const res = await worker.fetch(
    new Request('https://api.example.com/api/organization', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${await bearer()}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    }),
    ENV,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const PROFILE = { name: 'Sri Lakshmi Fuels', metadata: { gstin: '32AAACS1234A1Z5' } };

describe('PUT /api/organization on the mounted app (#626)', () => {
  beforeEach(() => {
    state.subscriptionStatus = 'ACTIVE';
    state.organizationUpdates = 0;
    state.idempotencyKey = null;
  });

  it('answers in the envelope and replays a retried Idempotency-Key without writing again', async () => {
    const first = await put(PROFILE, 'org-save-1');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      success: true,
      data: { id: ORG_ID, name: PROFILE.name, metadata: PROFILE.metadata },
    });

    const retry = await put(PROFILE, 'org-save-1');
    expect(retry).toEqual(first);
    expect(state.organizationUpdates).toBe(1);
  });

  it('refuses the same key with a different profile', async () => {
    await put(PROFILE, 'org-save-1');
    const reused = await put({ ...PROFILE, name: 'Another Name' }, 'org-save-1');
    expect(reused.status).toBe(409);
    expect(reused.body).toMatchObject({
      success: false,
      error: { code: IDEMPOTENCY_KEY_REUSED },
    });
    expect(state.organizationUpdates).toBe(1);
  });

  it('refuses under Restricted Access in the envelope, writing nothing', async () => {
    state.subscriptionStatus = 'RESTRICTED';
    const res = await put(PROFILE, 'org-save-2');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'SUBSCRIPTION_RESTRICTED' },
    });
    expect(state.organizationUpdates).toBe(0);
  });
});
