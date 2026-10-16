import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { OrganizationPayload, Role } from '@pump/shared';
import { getOrganizationHandler, organizationRouter } from './organization.js';
import {
  ACTIVE,
  IN_GRACE,
  LAPSED_GRACE,
  RESTRICTED,
  SUSPENDED,
  fakeAccessDb,
  type Subscription,
} from './write-policy-harness.js';

/**
 * `GET /organization` reaches every Role: the Profile and the mobile account
 * sheet read it. (Letterheads read the Station's Branding, not this.) Plan and
 * billing columns must leave the server only for Owners and Managers (#616).
 * These tests drive the real handler against a fake DB returning the stored
 * Organization row.
 */

const STORED_ROW = {
  id: 'org-1',
  name: 'Sri Lakshmi Fuels',
  metadata: {
    legalName: 'Sri Lakshmi Fuels Pvt Ltd',
    gstin: '32AAACS1234A1Z5',
    pan: 'AAACS1234A',
    stateCode: '32',
    address: 'NH 66, Kozhikode',
    phone: '+91 98470 12345',
    email: 'office@srilakshmi.in',
  },
  subscriptionPlan: 'CORE',
  subscriptionStatus: 'PAST_DUE',
  accessUntil: new Date('2026-11-01T00:00:00.000Z'),
  isDemo: false,
  demoExpiresAt: null,
  suspendedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-01T00:00:00.000Z'),
};

const PROFILE_FIELDS = ['id', 'name', 'metadata', 'createdAt', 'updatedAt'];
const COMMERCIAL_FIELDS = [
  'subscriptionPlan',
  'subscriptionStatus',
  'accessUntil',
  'isDemo',
  'demoExpiresAt',
  'suspendedAt',
];

async function request(role: Role, { stored = true } = {}) {
  const row = stored ? STORED_ROW : undefined;
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  const db = { query: { organizations: { findFirst: async () => row } } };
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'someone@example.com',
      fullName: 'Someone',
      organizationId: 'org-1',
      role,
      assignedStationIds: [],
    });
    await next();
  });
  app.get('/organization', getOrganizationHandler);
  return app.request('/organization');
}

async function getOrganization(role: Role): Promise<OrganizationPayload> {
  const res = await request(role);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { success: boolean; data: OrganizationPayload };
  expect(body.success).toBe(true);
  return body.data;
}

describe('GET /organization (#616)', () => {
  it.each<Role>(['Owner', 'Manager'])(
    'sends %s the profile and the commercial fields',
    async (role) => {
      const org = await getOrganization(role);
      expect(Object.keys(org).sort()).toEqual([...PROFILE_FIELDS, ...COMMERCIAL_FIELDS].sort());
      expect(org.subscriptionPlan).toBe('CORE');
      expect(org.subscriptionStatus).toBe('PAST_DUE');
      expect(org.accessUntil).toBe('2026-11-01T00:00:00.000Z');
    },
  );

  it.each<Role>(['Accountant', 'Staff', 'Attendant'])('sends %s the profile only', async (role) => {
    const org = await getOrganization(role);
    expect(Object.keys(org).sort()).toEqual([...PROFILE_FIELDS].sort());
    expect(org.name).toBe('Sri Lakshmi Fuels');
    expect(org.metadata).toEqual(STORED_ROW.metadata);
  });

  it('answers NOT_FOUND when the Organization row is missing', async () => {
    const res = await request('Owner', { stored: false });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

/**
 * `PUT /organization` (#626): Owner only, and declared FINISH_OPEN_WORK — the
 * profile is the Organization's legal and billing identity, so Restricted
 * Access lets the Owner correct it; Suspension stops it like every write.
 * Driven through the mounted router, so the guard is proven attached.
 */
const UPDATE = {
  name: 'Sri Lakshmi Fuels',
  metadata: { legalName: 'Sri Lakshmi Fuels Pvt Ltd', gstin: '32AAACS1234A1Z5' },
};

async function put(
  subscription: Subscription,
  { role = 'Owner', body = UPDATE }: { role?: Role; body?: unknown } = {},
) {
  let updates = 0;
  const access = fakeAccessDb(subscription);
  const db = {
    ...access,
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            updates += 1;
            return [STORED_ROW];
          },
        }),
      }),
    }),
  };
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: 'org-1',
      role,
      assignedStationIds: [],
    });
    await next();
  });
  app.route('/organization', organizationRouter);
  const res = await app.request('/organization', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success: boolean; error?: { code: string } };
  return { status: res.status, code: json.error?.code ?? null, success: json.success, updates };
}

describe('PUT /organization (#626)', () => {
  it.each([
    ['active', ACTIVE],
    ['in a Payment Grace Period', IN_GRACE],
    ['under Restricted Access', RESTRICTED],
    ['past a lapsed grace period', LAPSED_GRACE],
  ])('lets the Owner edit the profile while %s', async (_label, subscription) => {
    const result = await put(subscription);
    expect(result.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.updates).toBe(1);
  });

  it('refuses a suspended Organization before writing anything', async () => {
    const result = await put(SUSPENDED);
    expect(result.status).toBe(403);
    expect(result.code).toBe('ORGANIZATION_SUSPENDED');
    expect(result.updates).toBe(0);
  });

  it.each<Role>(['Manager', 'Accountant', 'Staff', 'Attendant'])(
    'refuses %s: only the Owner manages the organization',
    async (role) => {
      const result = await put(ACTIVE, { role });
      expect(result.status).toBe(403);
      expect(result.code).toBe('FORBIDDEN');
      expect(result.updates).toBe(0);
    },
  );

  it('keeps the Role check under Restricted Access', async () => {
    const result = await put(RESTRICTED, { role: 'Manager' });
    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('answers VALIDATION_ERROR for an invalid profile', async () => {
    const result = await put(ACTIVE, { body: { name: 'X' } });
    expect(result.status).toBe(400);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.updates).toBe(0);
  });
});
