import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { sign } from 'hono/jwt';
import { schema } from '@pump/db';

/**
 * The `login_count` Limit through the real app (#648): JWT auth, the
 * write-policy guard, the handler, the login-capacity check and the use-case.
 * Only the database and the Supabase admin client are fake.
 */

const ORG_ID = 'org-1';
const SECRET = 'test-secret-for-hs256-only';
const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'service-key',
  SUPABASE_JWT_SECRET: SECRET,
  SUPABASE_DIRECT_URL: 'postgres://fake',
};
const TARGET = 'user-2';

const state = {
  plan: 'CORE',
  isDemo: false,
  logins: 0,
  overrides: [] as Array<{ limitKey: string; value: number }>,
  targetAuthUserId: 'auth-target' as string | null,
  targetStatus: 'INACTIVE',
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
        subscriptionPlan: state.plan,
        subscriptionStatus: 'ACTIVE',
        accessUntil: null,
        suspendedAt: null,
        isDemo: state.isDemo,
      },
    ];
  }
  if (table === schema.stations) return [{ value: 1, logins: state.logins }];
  if (table === schema.organizationLimitOverrides) return state.overrides;
  if (table === schema.users) {
    return [
      {
        id: TARGET,
        organizationId: ORG_ID,
        authUserId: state.targetAuthUserId,
        fullName: 'Ravi',
        email: null,
        phone: null,
        role: 'Staff',
        status: state.targetStatus,
        createdAt: dateOf,
        updatedAt: dateOf,
      },
    ];
  }
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
        role: 'Owner',
        status: 'ACTIVE',
      }),
    },
  },
  execute: async () => [],
  select: () => ({ from: (table: unknown) => chain(() => selectFrom(table)) }),
  insert: (table: unknown) => ({
    values: (row: any) => {
      if (table === schema.users) state.userWrites.push(row);
      const done: any = {
        then: (resolve: (v: unknown) => void) => resolve(undefined),
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: () => ({ returning: async () => [{ id: 'key-1' }] }),
        returning: async () => [row],
      };
      return done;
    },
  }),
  update: (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if (table === schema.users) state.userWrites.push(values);
        return { returning: async () => [], then: (r: (v: unknown) => void) => r(undefined) };
      },
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
    async createUser() {
      state.adminCalls.push('createUser');
      return { id: 'auth-new' };
    }
    async unbanUser() {
      state.adminCalls.push('unbanUser');
    }
    async banUser() {
      state.adminCalls.push('banUser');
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

const withLogin = {
  fullName: 'New Attendant',
  role: 'Attendant',
  phone: '9876543210',
  enableAppAccess: true,
  password: 'correct-horse',
};
const withoutLogin = { fullName: 'Record Only', role: 'Staff' };

beforeEach(() => {
  Object.assign(state, {
    plan: 'CORE',
    isDemo: false,
    logins: 0,
    overrides: [],
    targetAuthUserId: 'auth-target',
    targetStatus: 'INACTIVE',
    userWrites: [],
    adminCalls: [],
  });
});

describe('inviting a user with a login (#648)', () => {
  it('is refused with LIMIT_REACHED at the Core limit, before any login is created', async () => {
    state.logins = 3;
    const res = await call('POST', '', withLogin);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LIMIT_REACHED');
    expect(res.body.error.message).toMatch(/login limit is reached/);
    expect(res.body.error.details).toMatchObject({ limit: 'login_count', value: 3, used: 3 });
    expect(state.adminCalls).toEqual([]);
    expect(state.userWrites).toEqual([]);
  });

  it('succeeds below the limit', async () => {
    state.logins = 2;
    const res = await call('POST', '', withLogin);
    expect(res.status).toBe(200);
    expect(state.adminCalls).toEqual(['createUser']);
    expect(state.userWrites[0]).toMatchObject({ authUserId: 'auth-new' });
  });

  it('never counts, or refuses, a member without a login', async () => {
    state.logins = 3;
    const res = await call('POST', '', withoutLogin);
    expect(res.status).toBe(200);
    expect(state.adminCalls).toEqual([]);
  });

  it('is limited at 10 on Pro and unlimited on Pro+', async () => {
    state.plan = 'PRO';
    state.logins = 10;
    expect((await call('POST', '', withLogin)).body.error?.code).toBe('LIMIT_REACHED');
    state.plan = 'PRO_PLUS';
    state.logins = 500;
    expect((await call('POST', '', withLogin)).status).toBe(200);
  });

  it('is allowed past the plan limit by a platform override', async () => {
    state.logins = 3;
    state.overrides = [{ limitKey: 'login_count', value: 5 }];
    expect((await call('POST', '', withLogin)).status).toBe(200);
    state.logins = 5;
    expect((await call('POST', '', withLogin)).status).toBe(409);
  });

  it('is not limited in a demo Organization', async () => {
    state.isDemo = true;
    state.logins = 50;
    expect((await call('POST', '', withLogin)).status).toBe(200);
  });
});

describe('reactivating a member with a login (#648)', () => {
  it('takes a seat, so it is refused at the limit and leaves the login banned', async () => {
    state.logins = 3;
    const res = await call('POST', `/${TARGET}/reactivate`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LIMIT_REACHED');
    expect(state.adminCalls).toEqual([]);
  });

  it('succeeds below the limit', async () => {
    state.logins = 2;
    const res = await call('POST', `/${TARGET}/reactivate`);
    expect(res.status).toBe(200);
    expect(state.adminCalls).toEqual(['unbanUser']);
  });

  it('does not take a seat for a member without a login', async () => {
    state.logins = 3;
    state.targetAuthUserId = null;
    expect((await call('POST', `/${TARGET}/reactivate`)).status).toBe(200);
  });

  it('is also refused through PUT status=ACTIVE', async () => {
    state.logins = 3;
    const res = await call('PUT', `/${TARGET}`, { status: 'ACTIVE' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LIMIT_REACHED');
  });
});

describe('after a downgrade (#648)', () => {
  beforeEach(() => {
    state.logins = 7; // Core allows 3
    state.targetStatus = 'ACTIVE';
  });

  it('existing users keep working: edits and deactivation are not refused', async () => {
    expect((await call('PUT', `/${TARGET}`, { fullName: 'Ravi K' })).status).toBe(200);
    expect((await call('POST', `/${TARGET}/deactivate`)).status).toBe(200);
  });

  it('only new logins are refused', async () => {
    expect((await call('POST', '', withLogin)).status).toBe(409);
    expect((await call('POST', '', withoutLogin)).status).toBe(200);
  });
});
