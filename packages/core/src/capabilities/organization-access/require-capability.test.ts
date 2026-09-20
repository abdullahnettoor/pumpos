import { describe, expect, it } from 'vitest';
import { requireCapability } from './require-capability.js';
import type { OrganizationAccessInputs, OrganizationAccessReader } from './ports.js';
import { PRODUCT_ACCESS_REGISTRY, type AccessRegistry } from './registry.js';

/**
 * The capability gate. It answers a different question from a Role guard:
 * "has this Organization been given the feature", not "may this user use it".
 *
 * No production capability exists yet, so the gate is exercised against an
 * injected test registry — the same seam a real feature will use when it
 * ships, without registering something this build cannot do.
 */

const registry: AccessRegistry = {
  plans: { CORE: { key: 'CORE', capabilities: [], limits: { station_count: 1 } } },
  capabilities: {
    'exports.tally': {
      key: 'exports.tally',
      title: 'Tally export',
      unavailableMessage: 'Tally export is not available for this Organization.',
      resolution: 'CONTACT_PUMPOS',
      upgradable: true,
    },
  },
};

const inputs = (over: Partial<OrganizationAccessInputs> = {}): OrganizationAccessInputs => ({
  plan: 'CORE',
  subscriptionStatus: 'ACTIVE',
  accessUntil: null,
  grantedCapabilities: [],
  limitOverrides: {},
  usage: { station_count: 1 },
  ...over,
});

/** Reader whose answer can change between calls, like a real database. */
function reader(initial: OrganizationAccessInputs) {
  let current = initial;
  const port: OrganizationAccessReader & {
    loads: number;
    set: (next: OrganizationAccessInputs) => void;
  } = {
    loads: 0,
    set: (next) => {
      current = next;
    },
    load: async () => {
      port.loads += 1;
      return current;
    },
  };
  return port;
}

describe('requireCapability', () => {
  it('allows an Organization holding an active grant', async () => {
    const access = reader(inputs({ grantedCapabilities: ['exports.tally'] }));

    const result = await requireCapability({ access, registry }, 'org-1', 'exports.tally');

    expect(result.success).toBe(true);
  });

  it('allows a capability supplied by the Product Plan itself', async () => {
    const planRegistry: AccessRegistry = {
      ...registry,
      plans: {
        CORE: { key: 'CORE', capabilities: ['exports.tally'], limits: { station_count: 1 } },
      },
    };
    const access = reader(inputs());

    const result = await requireCapability(
      { access, registry: planRegistry },
      'org-1',
      'exports.tally',
    );

    expect(result.success).toBe(true);
  });

  it('refuses without the grant, naming the capability and the next action', async () => {
    const access = reader(inputs());

    const result = await requireCapability({ access, registry }, 'org-1', 'exports.tally');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('CAPABILITY_NOT_ENTITLED');
    expect(result.error.message).toBe('Tally export is not available for this Organization.');
    expect(result.error.details).toEqual({
      capability: 'exports.tally',
      resolution: 'CONTACT_PUMPOS',
      actionLabel: 'Contact PumpOS',
    });
  });

  it('fails closed for a capability this build does not define', async () => {
    const access = reader(inputs({ grantedCapabilities: ['exports.unbuilt'] }));

    const result = await requireCapability({ access, registry }, 'org-1', 'exports.unbuilt');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CAPABILITY_NOT_ENTITLED');
  });

  it('re-reads access on every call, so a revocation bites immediately', async () => {
    const access = reader(inputs({ grantedCapabilities: ['exports.tally'] }));
    const before = await requireCapability({ access, registry }, 'org-1', 'exports.tally');

    // The platform revokes the grant between two requests from the same client.
    access.set(inputs({ grantedCapabilities: [] }));
    const after = await requireCapability({ access, registry }, 'org-1', 'exports.tally');

    expect(before.success).toBe(true);
    expect(after.success).toBe(false);
    expect(access.loads).toBe(2);
  });

  it('refuses everything under the shipped registry, which gates nothing yet', async () => {
    const access = reader(inputs({ grantedCapabilities: ['exports.tally'] }));

    const result = await requireCapability(
      { access, registry: PRODUCT_ACCESS_REGISTRY },
      'org-1',
      'exports.tally',
    );

    // Nothing is registered in production, so nothing can be gated on — and a
    // gate on an unregistered key must refuse rather than pass.
    expect(result.success).toBe(false);
  });
});
