import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { sign } from 'hono/jwt';
import { schema } from '@pump/db';

/**
 * Self-action and last-Owner rules on the Team routes (#443), through the
 * real app. Only the database and the Supabase admin client are fake.
 */

const ORG_ID = 'org-1';
const SECRET = 'test-secret-for-hs256-only';
const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'service-key',
  SUPABASE_JWT_SECRET: SECRET,
  SUPABASE_DIRECT_URL: 'postgres://fake',
};
const ME = 'user-1';

type Member = { id: string; role: string; status: string };
const state = {
  members: [] as Member[],
  targetId: 'user-2',
  userWrites: [] as Array<Record<string, any>>,
  adminCalls: [] as string[],
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
        subscriptionPlan: 'PRO_PLUS',
        subscriptionStatus: 'ACTIVE',
        accessUntil: null,
        suspendedAt: null,
        isDemo: false,
      },
    ];
  }
  if (table === schema.stations) return [{ value: 1, logins: 0 }];
  if (table === schema.users) {
    // findById takes the first row, so the target leads; the list sees all.
    const rows = [...state.members].sort(
      (a, b) => Number(b.id === state.targetId) - Number(a.id === state.targetId),
    );
    return rows.map((m) => ({
      ...m,
      organizationId: ORG_ID,
      authUserId: `auth-${m.id}`,
      fullName: m.id,
      email: null,
      phone: null,
      createdAt: dateOf,
      updatedAt: dateOf,
    }));
  }
  if (table === schema.userStationAssignments) return [{ stationId: 's1', userId: state.targetId }];
  return [];
}

const fakeDb: Record<string, unknown> = {
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
  query: {
    users: {
      findFirst: async () => ({
        id: ME,
        authUserId: 'auth-1',
        email: 'owner@example.com',
        fullName: 'Owner',
        organizationId: ORG_ID,
        role: 'Owner',
        status: 'ACTIVE',
      }),
    },
  },
  execute: async () => [],
  select: () => ({ from: (table: unknown) => chain(() => selectFrom(table)) }),
  insert: () => ({
    values: () => ({
      then: (resolve: (v: unknown) => void) => resolve(undefined),
      onConflictDoUpdate: async (arg: any) => {
        state.userWrites.push(arg.set);
      },
      onConflictDoNothing: () => ({ returning: async () => [{ id: 'key-1' }] }),
    }),
  }),
  update: () => ({
    set: () => ({
      where: () => ({ returning: async () => [], then: (r: (v: unknown) => void) => r(undefined) }),
    }),
  }),
  delete: () => ({ where: async () => undefined }),
};

vi.mock('@pump/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pump/db')>()),
  createDb: () => fakeDb,
}));
vi.mock('../infra/supabase-admin.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infra/supabase-admin.js')>()),
  SupabaseAdmin: class {
    async unbanUser() {
      state.adminCalls.push('unbanUser');
    }
    async banUser() {
      state.adminCalls.push('banUser');
    }
    async updatePassword() {
      state.adminCalls.push('updatePassword');
    }
  },
}));

const { default: worker } = await import('../index.js');

async function call(method: string, path: string, body?: unknown) {
  const token = await sign(
    {
      sub: 'auth-1',
      iss: `${ENV.SUPABASE_URL}/auth/v1`,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    SECRET,
    'HS256',
  );
  const res = await worker.fetch(
    new Request(`https://api.example.com/api/setup/users${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    ENV,
  );
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const me = (): Member => ({ id: ME, role: 'Owner', status: 'ACTIVE' });
function setup(target: Member, others: Member[] = []) {
  state.targetId = target.id;
  state.members = [me(), target, ...others].filter(
    (m, i, all) => all.findIndex((x) => x.id === m.id) === i,
  );
}

beforeEach(() => {
  Object.assign(state, { members: [], targetId: 'user-2', userWrites: [], adminCalls: [] });
});

describe('self-targeted changes (#443)', () => {
  beforeEach(() => setup(me(), [{ id: 'user-2', role: 'Owner', status: 'ACTIVE' }]));

  it('refuses deactivating yourself', async () => {
    const res = await call('POST', `/${ME}/deactivate`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: "You can't deactivate your own account.",
    });
    expect(state.adminCalls).toEqual([]);
  });

  it('refuses setting your own status to INACTIVE through PUT', async () => {
    const res = await call('PUT', `/${ME}`, { status: 'INACTIVE' });
    expect(res.status).toBe(403);
    expect(state.userWrites).toEqual([]);
  });

  it('refuses changing your own Role, but allows an unchanged one', async () => {
    const res = await call('PUT', `/${ME}`, { role: 'Manager' });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("You can't change your own Role.");
    expect((await call('PUT', `/${ME}`, { role: 'Owner', fullName: 'Me' })).status).toBe(200);
  });

  it('refuses resetting your own password through the admin route', async () => {
    const res = await call('POST', `/${ME}/reset-password`, { password: 'correct-horse' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(state.adminCalls).toEqual([]);
  });
});

describe('last active Owner (#443)', () => {
  const second = { id: 'user-2', role: 'Owner', status: 'ACTIVE' };

  it('cannot be deactivated or demoted by another Owner', async () => {
    // The acting Owner is inactive in the data, so user-2 is the only active one.
    state.targetId = 'user-2';
    state.members = [{ ...me(), status: 'INACTIVE' }, second];
    const off = await call('POST', '/user-2/deactivate');
    expect(off.status).toBe(409);
    expect(off.body.error).toMatchObject({
      code: 'CONFLICT',
      message: 'An Organization needs at least one active Owner.',
    });
    expect((await call('PUT', '/user-2', { status: 'INACTIVE' })).status).toBe(409);
    expect((await call('PUT', '/user-2', { role: 'Manager' })).status).toBe(409);
    expect(state.adminCalls).toEqual([]);
    expect(state.userWrites).toEqual([]);
  });

  it('can be deactivated and demoted while another active Owner exists', async () => {
    setup(second);
    expect((await call('POST', '/user-2/deactivate')).status).toBe(200);
    expect(state.adminCalls).toEqual(['banUser']);
    expect((await call('PUT', '/user-2', { role: 'Manager' })).status).toBe(200);
  });
});

describe('other members are unaffected (#443)', () => {
  it('deactivates, reactivates, edits and resets a Manager', async () => {
    setup({ id: 'user-2', role: 'Manager', status: 'ACTIVE' });
    expect((await call('POST', '/user-2/deactivate')).status).toBe(200);
    expect((await call('PUT', '/user-2', { role: 'Staff' })).status).toBe(200);
    expect(
      (await call('POST', '/user-2/reset-password', { password: 'correct-horse' })).status,
    ).toBe(200);
    setup({ id: 'user-2', role: 'Manager', status: 'INACTIVE' });
    expect((await call('POST', '/user-2/reactivate')).status).toBe(200);
  });
});
