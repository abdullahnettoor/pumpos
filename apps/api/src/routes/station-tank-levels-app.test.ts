import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { sign } from 'hono/jwt';
import { schema } from '@pump/db';

/**
 * Tank rules through the real app (#690): JWT auth, production's
 * `resolveUserPermissions` (stored per-user overrides, ADR 0013), the
 * write-policy guard and the use-case, in the order `index.ts` mounts them.
 * Only the database is fake.
 */

const ORG_ID = '3f2a1b00-1111-4a2b-9c3d-000000000001';
const STATION = '7c1b2a40-5e0d-4f6a-9b1e-3a2d4c5e6f70';
const SECRET = 'test-secret-for-hs256-only';
const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_SECRET: SECRET,
  SUPABASE_DIRECT_URL: 'postgres://fake',
};
const STORED = {
  shift_grace_minutes: 15,
  report_config: { paper: 'A4' },
  tankLevels: { criticalBelowPct: 25, lowBelowPct: 40 },
};
const dateOf = new Date('2026-01-01T00:00:00.000Z');

const state = {
  changes: null as null | { granted: string[]; revoked: string[] },
  patches: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, any>>,
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

const stationRow = {
  value: 1,
  id: STATION,
  organizationId: ORG_ID,
  name: 'Station',
  code: 'ST1',
  address: null,
  phone: null,
  settings: STORED,
  onboardingStatus: 'COMPLETED',
  isActive: true,
  createdAt: dateOf,
  updatedAt: dateOf,
};

function selectFrom(table: unknown): unknown[] {
  if (table === schema.organizations)
    return [
      {
        subscriptionPlan: 'CORE',
        subscriptionStatus: 'ACTIVE',
        accessUntil: null,
        suspendedAt: null,
        isDemo: false,
      },
    ];
  if (table === schema.stations) return [stationRow];
  if (table === schema.organizationCapabilityGrants)
    return [{ capabilityKey: 'permissions.custom' }];
  if (table === schema.userPermissionChanges)
    return state.changes ? [{ organizationId: ORG_ID, ...state.changes }] : [];
  if (table === schema.userStationAssignments) return [{ stationId: STATION }];
  return [];
}

const fakeDb: Record<string, unknown> = {
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
  query: {
    users: {
      findFirst: async () => ({
        id: '5e4d3c00-2222-4a2b-9c3d-000000000002',
        authUserId: 'auth-1',
        email: 'manager@example.com',
        fullName: 'Manager',
        organizationId: ORG_ID,
        role: 'Manager',
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
      onConflictDoUpdate: async () => {},
      onConflictDoNothing: () => ({ returning: async () => [{ id: 'key-1' }] }),
    }),
  }),
  update: (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if (table === schema.stations) state.patches.push(values);
        return {
          returning: async () => [stationRow],
          then: (r: (v: unknown) => void) => r(undefined),
        };
      },
    }),
  }),
  delete: () => ({ where: async () => {} }),
};

vi.mock('@pump/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pump/db')>()),
  createDb: () => fakeDb,
}));

const { default: worker } = await import('../index.js');

async function save(body: unknown) {
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
    new Request(`https://api.example.com/api/setup/stations/${STATION}/tank-levels`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ENV,
  );
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const patchJson = () => {
  const chunks = (state.patches[0]!.settings as any).queryChunks as unknown[];
  return JSON.parse(chunks.find((c) => typeof c === 'string' && c.startsWith('{')) as string);
};
const CHANGE = { tankLevels: { criticalBelowPct: 10, lowBelowPct: 30 } };

describe('PUT /setup/stations/:id/tank-levels through resolveUserPermissions (#690)', () => {
  beforeEach(() => {
    state.changes = null;
    state.patches = [];
    state.events = [];
  });

  it('saves for a Manager with the Role defaults', async () => {
    const r = await save(CHANGE);
    expect(r.status).toBe(200);
    expect(patchJson()).toEqual(CHANGE);
  });

  it('saves for a Manager whose stored override revokes station.manage, keeping station.tankLevels', async () => {
    state.changes = { granted: [], revoked: ['station.manage'] };
    const r = await save(CHANGE);
    expect(r.status).toBe(200);
    expect(state.patches).toHaveLength(1);
    expect(Object.keys(state.patches[0]).sort()).toEqual(['settings', 'updatedAt']);
    expect(patchJson()).toEqual(CHANGE);
    expect(state.events).toHaveLength(1);
  });

  it('refuses a Manager whose overrides revoke station.manage and station.tankLevels', async () => {
    state.changes = { granted: [], revoked: ['station.manage', 'station.tankLevels'] };
    const r = await save(CHANGE);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    expect(state.patches).toHaveLength(0);
    expect(state.events).toHaveLength(0);
  });
});
