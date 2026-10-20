import { describe, expect, it } from 'vite-plus/test';
import { organizationUpdateSchema, type Role } from '@pump/shared';
import {
  ORGANIZATION_PROFILE_KEYS,
  pickProfileMetadata,
  shapeOrganizationPayload,
  type OrganizationRecord,
} from './organization-payload.js';

const PROFILE = {
  legalName: 'Sri Lakshmi Fuels Pvt Ltd',
  gstin: '32AAACS1234A1Z5',
  pan: 'AAACS1234A',
  stateCode: '32',
  address: 'NH 66, Kozhikode',
  phone: '+91 98470 12345',
  email: 'office@srilakshmi.in',
};

const row = (over: Partial<OrganizationRecord> = {}): OrganizationRecord => ({
  id: 'org-1',
  name: 'Sri Lakshmi Fuels',
  metadata: PROFILE,
  subscriptionPlan: 'CORE',
  subscriptionStatus: 'PAST_DUE',
  accessUntil: new Date('2026-11-01T00:00:00.000Z'),
  isDemo: false,
  demoExpiresAt: null,
  suspendedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-01T00:00:00.000Z'),
  ...over,
});

const COMMERCIAL_KEYS = [
  'subscriptionPlan',
  'subscriptionStatus',
  'accessUntil',
  'isDemo',
  'demoExpiresAt',
  'suspendedAt',
];

describe('shapeOrganizationPayload (#616)', () => {
  it.each<Role>(['Owner', 'Manager'])('gives %s the profile and the commercial detail', (role) => {
    expect(shapeOrganizationPayload(row(), role)).toEqual({
      id: 'org-1',
      name: 'Sri Lakshmi Fuels',
      metadata: PROFILE,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      subscriptionPlan: 'CORE',
      subscriptionStatus: 'PAST_DUE',
      accessUntil: '2026-11-01T00:00:00.000Z',
      isDemo: false,
      demoExpiresAt: null,
      suspendedAt: null,
    });
  });

  it.each<Role>(['Accountant', 'Staff', 'Attendant'])(
    'gives %s the profile and no commercial field',
    (role) => {
      const payload = shapeOrganizationPayload(row(), role);
      expect(payload).toEqual({
        id: 'org-1',
        name: 'Sri Lakshmi Fuels',
        metadata: PROFILE,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      });
      for (const key of COMMERCIAL_KEYS) expect(payload).not.toHaveProperty(key);
    },
  );

  it('passes stored ISO strings through unchanged', () => {
    const payload = shapeOrganizationPayload(
      row({ suspendedAt: '2026-03-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' }),
      'Owner',
    );
    expect(payload.suspendedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(payload.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('pickProfileMetadata', () => {
  it('drops keys that are not part of the profile', () => {
    expect(pickProfileMetadata({ gstin: '32AAACS1234A1Z5', billingNote: 'owes 2 months' })).toEqual(
      { gstin: '32AAACS1234A1Z5' },
    );
  });

  it('keeps null and drops non-string values', () => {
    expect(pickProfileMetadata({ pan: null, phone: 42 })).toEqual({ pan: null });
  });

  it.each([null, undefined, 'text', 3])('reads %s as an empty profile', (value) => {
    expect(pickProfileMetadata(value)).toEqual({});
  });

  it('covers every metadata key an Owner can save', () => {
    const metadata = organizationUpdateSchema.shape.metadata.unwrap().unwrap();
    expect([...ORGANIZATION_PROFILE_KEYS].sort()).toEqual(Object.keys(metadata.shape).sort());
  });
});
