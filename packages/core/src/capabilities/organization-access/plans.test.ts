import { describe, expect, it } from 'vitest';
import { UNLIMITED_LIMIT } from '@pump/shared';
import {
  ATTENDANT_PHONE_HANDOVER_CAPABILITY,
  ATTENDANT_REPORT_CAPABILITY,
  CUSTOM_PERMISSIONS_CAPABILITY,
} from '@pump/shared';
import type { OrganizationAccessInputs } from './ports.js';
import { buildAccessDocument } from './resolve-access.js';
import { resolveProductPlan } from './registry.js';
import { ensureStationCapacity, type StationCapacityPort } from './station-capacity.js';

const portFor = (over: Partial<OrganizationAccessInputs>): StationCapacityPort => ({
  lockOrganization: async () => {},
  load: async () => inputs(over),
});

const inputs = (over: Partial<OrganizationAccessInputs> = {}): OrganizationAccessInputs => ({
  plan: 'CORE',
  subscriptionStatus: 'ACTIVE',
  accessUntil: null,
  grantedCapabilities: [],
  limitOverrides: {},
  usage: { station_count: 1 },
  ...over,
});

const doc = (over: Partial<OrganizationAccessInputs> = {}) =>
  buildAccessDocument({ inputs: inputs(over), role: 'OWNER' });

const enabled = (over: Partial<OrganizationAccessInputs> = {}) =>
  Object.entries(doc(over).capabilities)
    .filter(([, entry]) => entry.enabled)
    .map(([key]) => key)
    .sort();

describe('Product Plans in the Access Document', () => {
  it('Core: one Station, nothing gated on', () => {
    expect(enabled({ plan: 'CORE' })).toEqual([]);
    expect(doc({ plan: 'CORE' }).limits.station_count.value).toBe(1);
  });

  it('Pro: several Stations, no Pro+ capability', () => {
    expect(enabled({ plan: 'PRO' })).toEqual([ATTENDANT_PHONE_HANDOVER_CAPABILITY]);
    expect(
      doc({ plan: 'PRO', usage: { station_count: 5 } }).limits.station_count.value,
    ).toBeGreaterThanOrEqual(UNLIMITED_LIMIT);
  });

  it('Pro+: several Stations, Custom permissions and the Attendant report', () => {
    expect(enabled({ plan: 'PRO_PLUS' })).toEqual(
      [
        ATTENDANT_PHONE_HANDOVER_CAPABILITY,
        CUSTOM_PERMISSIONS_CAPABILITY,
        ATTENDANT_REPORT_CAPABILITY,
      ].sort(),
    );
    expect(doc({ plan: 'PRO_PLUS' }).limits.station_count.value).toBeGreaterThanOrEqual(
      UNLIMITED_LIMIT,
    );
  });

  it('an unknown or missing plan is Core', () => {
    expect(resolveProductPlan('SCALE').key).toBe('CORE');
    expect(resolveProductPlan(null).key).toBe('CORE');
    expect(doc({ plan: 'SCALE' }).limits.station_count.value).toBe(1);
  });

  it('platform grants and Limit overrides still win', () => {
    expect(enabled({ plan: 'PRO', grantedCapabilities: [CUSTOM_PERMISSIONS_CAPABILITY] })).toEqual(
      [ATTENDANT_PHONE_HANDOVER_CAPABILITY, CUSTOM_PERMISSIONS_CAPABILITY].sort(),
    );
    expect(
      doc({ plan: 'PRO', limitOverrides: { station_count: 2 } }).limits.station_count.value,
    ).toBe(2);
    expect(
      doc({ plan: 'PRO_PLUS', limitOverrides: { station_count: 1 } }).limits.station_count.value,
    ).toBe(1);
  });

  it('a second Station is refused on Core and allowed on Pro and Pro+', async () => {
    const used = { station_count: 1 };
    expect((await ensureStationCapacity(portFor({ plan: 'CORE', usage: used }), 'o')).success).toBe(
      false,
    );
    expect((await ensureStationCapacity(portFor({ plan: 'PRO', usage: used }), 'o')).success).toBe(
      true,
    );
    expect(
      (await ensureStationCapacity(portFor({ plan: 'PRO_PLUS', usage: used }), 'o')).success,
    ).toBe(true);
  });
});
