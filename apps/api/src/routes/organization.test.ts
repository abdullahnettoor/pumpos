import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { OrganizationPayload, Role } from '@pump/shared';
import { getOrganizationHandler } from './organization.js';

/**
 * `GET /organization` reaches every Role: the Profile, the mobile account
 * sheet and the letterhead read it. Plan and billing columns must leave the
 * server only for Owners and Managers (#616). These tests drive the real
 * handler against a fake DB returning the stored Organization row.
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
