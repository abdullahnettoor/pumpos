import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { sign } from 'hono/jwt';
import { schema } from '@pump/db';
import { IDEMPOTENCY_KEY_REUSED } from '@pump/shared';

/**
 * POST /setup/users/:id/app-access through the real app (#462): JWT auth, the
 * idempotency middleware, the write-policy guard, rate limit, the handler, the
 * login-capacity check and the use-case. Only the database and the Supabase
 * admin client are fake.
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
const ACTOR = 'user-1';
const PASSWORD = 'correct-horse-battery';

const state = {
  actorRole: 'Owner',
  actorStations: ['s1'] as string[],
  subscriptionStatus: 'ACTIVE',
  logins: 0,
  targetOrg: ORG_ID,
  targetRole: 'Staff',
  targetStatus: 'ACTIVE',
  targetStations: ['s1'] as string[],
  targetEmail: null as string | null,
  targetAuthUserId: null as string | null,
  userWrites: [] as Array<Record<string, any>>,
  failLink: false,
  events: [] as Array<Record<string, any>>,
  idempotencyKey: null as Record<string, unknown> | null,
  adminCreated: [] as Array<{ email: string; password: string }>,
  adminDeleted: [] as string[],
  adminFailure: null as null | { status: number; message: string },
  /** A concurrent commit landing as the Organization lock is taken. */
  onLock: null as null | (() => void),
  inTransaction: false,
  failPermissionsRead: false,
  permissionsReadInTransaction: null as boolean | null,
};

/** Every bound parameter of a drizzle condition, so the fake can tell whose rows are asked for. */
function paramsOf(node: unknown, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== 'object') return out;
  const n = node as { queryChunks?: unknown[]; value?: unknown; constructor?: { name?: string } };
  if (Array.isArray(n.queryChunks)) n.queryChunks.forEach((c) => paramsOf(c, out));
  else if (n.constructor?.name === 'Param') out.push(n.value);
  return out;
}

function chain(result: (cond: unknown[]) => unknown[]) {
  let cond: unknown[] = [];
  const link = {
    from: () => link,
    where: (c: unknown) => {
      cond = paramsOf(c);
      return link;
    },
    limit: () => link,
    orderBy: () => link,
    for: () => link,
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
      Promise.resolve()
        .then(() => result(cond))
        .then(resolve, reject),
  };
  return link;
}

const dateOf = new Date('2026-01-01T00:00:00.000Z');

function selectFrom(table: unknown, cond: unknown[]): unknown[] {
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
  if (table === schema.stations) return [{ value: 1, logins: state.logins }];
  if (table === schema.users) {
    return [
      {
        id: TARGET,
        organizationId: state.targetOrg,
        authUserId: state.targetAuthUserId,
        fullName: 'Ravi',
        email: state.targetEmail,
        phone: null,
        role: state.targetRole,
        status: state.targetStatus,
        createdAt: dateOf,
        updatedAt: dateOf,
      },
    ];
  }
  if (table === schema.userStationAssignments) {
    const stations = cond.includes(ACTOR) ? state.actorStations : state.targetStations;
    return stations.map((stationId) => ({ stationId }));
  }
  if (table === schema.userPermissionChanges) {
    state.permissionsReadInTransaction = state.inTransaction;
    if (state.failPermissionsRead) throw new Error('db down');
    return [];
  }
  if (table === schema.idempotencyKeys) return state.idempotencyKey ? [state.idempotencyKey] : [];
  return [];
}

const fakeDb: Record<string, unknown> = {
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    state.inTransaction = true;
    try {
      return await fn(fakeDb);
    } finally {
      state.inTransaction = false;
    }
  },
  query: {
    users: {
      findFirst: async () => ({
        id: ACTOR,
        authUserId: 'auth-1',
        email: 'owner@example.com',
        fullName: 'Owner',
        organizationId: ORG_ID,
        role: state.actorRole,
        status: 'ACTIVE',
      }),
    },
  },
  execute: async () => {
    state.onLock?.();
    return [];
  },
  select: () => ({ from: (table: unknown) => chain((cond) => selectFrom(table, cond)) }),
  insert: (table: unknown) => ({
    values: (row: any) => {
      if (table === schema.users) {
        if (state.failLink) throw new Error('db down');
        state.userWrites.push(row);
      }
      if (table === schema.events) state.events.push(...row);
      const done: any = {
        then: (resolve: (v: unknown) => void) => resolve(undefined),
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: () => ({
          returning: async () => {
            if (state.idempotencyKey) return [];
            state.idempotencyKey = {
              ...row,
              id: 'key-1',
              responseStatus: null,
              responseBody: null,
            };
            return [{ id: 'key-1' }];
          },
        }),
      };
      return done;
    },
  }),
  update: (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if (table === schema.users) {
          if (state.failLink) throw new Error('db down');
          state.userWrites.push(values);
        }
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
vi.mock('../infra/supabase-admin.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infra/supabase-admin.js')>()),
  SupabaseAdmin: class {
    async createUser(input: { email: string; password: string }) {
      if (state.adminFailure) {
        const { SupabaseAdminError } =
          await importOriginal<typeof import('../infra/supabase-admin.js')>();
        throw new SupabaseAdminError(state.adminFailure.message, state.adminFailure.status, null);
      }
      state.adminCreated.push(input);
      return { id: 'auth-new' };
    }
    async deleteUser(id: string) {
      state.adminDeleted.push(id);
    }
  },
}));

const { default: worker } = await import('../index.js');

let nextIp = 0;
async function post(body: unknown, opts: { key?: string; ip?: string; id?: string } = {}) {
  const sub = `auth-${state.actorRole}-${state.actorStations.join('+')}-${nextIp}`;
  const token = await sign(
    {
      sub,
      iss: `${ENV.SUPABASE_URL}/auth/v1`,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 600,
    },
    SECRET,
    'HS256',
  );
  const res = await worker.fetch(
    new Request(`https://api.example.com/api/setup/users/${opts.id ?? TARGET}/app-access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': opts.ip ?? `10.0.0.${nextIp++}`,
        ...(opts.key ? { 'Idempotency-Key': opts.key } : {}),
      },
      body: JSON.stringify(body),
    }),
    ENV,
  );
  // An unhandled failure is Hono's plain-text 500, not the JSON envelope.
  const text = await res.text();
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { text };
  }
  return { status: res.status, body: parsed };
}

const byEmail = { email: 'Ravi@Example.com', password: PASSWORD };
const byPhone = { phone: '98765 43210', password: PASSWORD };

beforeEach(() => {
  Object.assign(state, {
    actorRole: 'Owner',
    actorStations: ['s1'],
    subscriptionStatus: 'ACTIVE',
    logins: 0,
    targetOrg: ORG_ID,
    targetRole: 'Staff',
    targetStatus: 'ACTIVE',
    targetStations: ['s1'],
    targetAuthUserId: null,
    userWrites: [],
    failLink: false,
    events: [],
    idempotencyKey: null,
    adminCreated: [],
    adminDeleted: [],
    adminFailure: null,
    targetEmail: null,
    onLock: null,
    inTransaction: false,
    failPermissionsRead: false,
    permissionsReadInTransaction: null,
  });
});

const refusedUntouched = () => {
  expect(state.adminCreated).toEqual([]);
  expect(state.userWrites).toEqual([]);
  expect(state.events).toEqual([]);
};

describe('POST /setup/users/:id/app-access (#462)', () => {
  it('Owner gives a member a login by email: creates it, links it, emits the event', async () => {
    const r = await post(byEmail);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toMatchObject({
      id: TARGET,
      hasLogin: true,
      email: 'ravi@example.com',
      stationIds: ['s1'],
      hasCustomPermissions: false,
    });
    expect(r.body.data).not.toHaveProperty('authUserId');
    expect(state.adminCreated).toEqual([{ email: 'ravi@example.com', password: PASSWORD }]);
    expect(state.userWrites.some((w) => w.authUserId === 'auth-new')).toBe(true);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      eventType: 'USER_APP_ACCESS_GRANTED',
      aggregateType: 'User',
      aggregateId: TARGET,
      organizationId: ORG_ID,
      actorId: ACTOR,
    });
  });

  it('derives the login handle from a phone identity', async () => {
    const r = await post(byPhone);
    expect(r.status).toBe(200);
    expect(state.adminCreated[0]?.email).toBe('919876543210@users.pumpos.app');
    expect(r.body.data.phone).toBe('+919876543210');
  });

  it('Owner may give access to a member of any Role at any Station', async () => {
    state.targetRole = 'Manager';
    state.targetStations = ['s9'];
    expect((await post(byEmail)).status).toBe(200);
  });

  it.each(['Staff', 'Attendant'])(
    'Manager may give a %s on their own Station access',
    async (role) => {
      state.actorRole = 'Manager';
      state.targetRole = role;
      expect((await post(byEmail)).status).toBe(200);
    },
  );

  it.each([
    ['a Manager', { targetRole: 'Manager' }],
    ['an Accountant', { targetRole: 'Accountant' }],
    ['an Owner', { targetRole: 'Owner' }],
    ['a Staff at another Station', { targetStations: ['s2'] }],
    ['a Staff at an own and another Station', { targetStations: ['s1', 's2'] }],
    ['a Staff with no Station', { targetStations: [] }],
  ])('Manager is refused for %s', async (_name, target) => {
    state.actorRole = 'Manager';
    Object.assign(state, target);
    const r = await post(byEmail);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    refusedUntouched();
  });

  it('judges the member as locked and current, not as first read', async () => {
    state.actorRole = 'Manager';
    // A Staff at the Manager's Station when the request arrived; promoted before the lock.
    state.onLock = () => {
      state.targetRole = 'Manager';
    };
    const r = await post(byEmail);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    refusedUntouched();
  });

  it('judges the current Stations too: a member moved to another Station is refused', async () => {
    state.actorRole = 'Manager';
    state.onLock = () => {
      state.targetStations = ['s2'];
    };
    const r = await post(byEmail);
    expect(r.status).toBe(403);
    refusedUntouched();
  });

  it('refuses a phone login for a member with an email on record', async () => {
    state.targetEmail = 'ravi@example.com';
    const r = await post(byPhone);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.message).toBe(
      'This member has an email on record. Give access with that email.',
    );
    refusedUntouched();
  });

  it('gives an email login to a member with an email on record', async () => {
    state.targetEmail = 'ravi@example.com';
    expect((await post({ email: 'ravi@example.com', password: PASSWORD })).status).toBe(200);
  });

  it('builds the whole answer inside the transaction', async () => {
    const r = await post(byEmail);
    expect(r.status).toBe(200);
    expect(state.permissionsReadInTransaction).toBe(true);
  });

  it('rolls everything back, login included, when the answer cannot be built', async () => {
    state.failPermissionsRead = true;
    const r = await post(byEmail, { key: 'k-fail' });
    expect(r.status).toBe(500);
    expect(state.adminDeleted).toEqual(['auth-new']);
  });

  it.each(['Accountant', 'Staff', 'Attendant'])('is refused for a %s', async (role) => {
    state.actorRole = role;
    const r = await post(byEmail);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    refusedUntouched();
  });

  it('refuses a member who already has a login', async () => {
    state.targetAuthUserId = 'auth-old';
    const r = await post(byEmail);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CONFLICT');
    expect(r.body.error.details).toMatchObject({ reason: 'ALREADY_HAS_LOGIN' });
    expect(r.body.error.message).toMatch(/already has app access/);
    refusedUntouched();
  });

  it.each([
    ['an email', byEmail],
    ['a phone', byPhone],
  ])('refuses %s already used by another login, linking nothing', async (_name, body) => {
    state.adminFailure = { status: 422, message: 'A user with this email already exists' };
    const r = await post(body);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CONFLICT');
    expect(r.body.error.details).toMatchObject({ reason: 'IDENTITY_TAKEN' });
    expect(state.userWrites).toEqual([]);
    expect(state.events).toEqual([]);
  });

  it('reports a provisioning failure without linking anything', async () => {
    state.adminFailure = { status: 500, message: 'auth down' };
    const r = await post(byEmail);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('AUTH_PROVISION_FAILED');
    expect(state.userWrites).toEqual([]);
  });

  it('is refused with LIMIT_REACHED at the login limit, before any login is created', async () => {
    state.logins = 3;
    const r = await post(byEmail);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('LIMIT_REACHED');
    expect(r.body.error.details).toMatchObject({ limit: 'login_count', value: 3, used: 3 });
    refusedUntouched();
  });

  it('takes no seat for an INACTIVE member, even at the limit', async () => {
    state.logins = 3;
    state.targetStatus = 'INACTIVE';
    expect((await post(byEmail)).status).toBe(200);
  });

  it('treats a member of another Organization as not found', async () => {
    state.targetOrg = 'org-2';
    const r = await post(byEmail);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    refusedUntouched();
  });

  it.each([
    ['no password', { email: 'r@example.com' }],
    ['a short password', { email: 'r@example.com', password: 'short' }],
    ['no identity', { password: PASSWORD }],
    ['both identities', { email: 'r@example.com', phone: '9876543210', password: PASSWORD }],
    ['an invalid phone', { phone: '555', password: PASSWORD }],
  ])('rejects %s', async (_name, body) => {
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    refusedUntouched();
  });

  it('is blocked under Restricted Access', async () => {
    state.subscriptionStatus = 'RESTRICTED';
    const r = await post(byEmail);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('SUBSCRIPTION_RESTRICTED');
    refusedUntouched();
  });

  it('deletes the login it created when the database link fails', async () => {
    state.failLink = true;
    const r = await post(byEmail);
    expect(r.status).toBe(500);
    expect(state.adminCreated).toHaveLength(1);
    expect(state.adminDeleted).toEqual(['auth-new']);
    expect(state.events).toEqual([]);
  });

  it('replays a retried Idempotency-Key without creating a second login', async () => {
    const first = await post(byEmail, { key: 'k-1' });
    const retry = await post(byEmail, { key: 'k-1' });
    expect(retry).toEqual(first);
    expect(state.adminCreated).toHaveLength(1);
    expect(state.events).toHaveLength(1);
    const reused = await post({ ...byEmail, password: 'another-password' }, { key: 'k-1' });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe(IDEMPOTENCY_KEY_REUSED);
  });

  it('is rate limited like reset-password', async () => {
    state.targetAuthUserId = 'auth-old';
    const statuses: number[] = [];
    for (let i = 0; i < 16; i++) statuses.push((await post(byEmail, { ip: '10.9.9.9' })).status);
    expect(statuses.slice(0, 15).every((s) => s === 409)).toBe(true);
    expect(statuses[15]).toBe(429);
  });

  it('never logs the password, in a success or a failure', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    try {
      await post(byEmail);
      state.failLink = true;
      await post(byPhone);
      state.failLink = false;
      state.adminFailure = { status: 422, message: 'taken' };
      await post(byEmail);
      const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
      expect(logged).not.toContain(PASSWORD);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
