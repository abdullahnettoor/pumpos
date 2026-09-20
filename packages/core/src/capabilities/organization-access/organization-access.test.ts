import { describe, expect, it } from 'vitest';
import type { Role } from '@pump/shared';
import { FixedClock, SequentialIdGenerator } from '../../kernel/index.js';
import type { ExecutionContext } from '../../kernel/index.js';
import { GetAccessDocument } from './get-access-document.js';
import {
  ATTENDANT_REPORT_CAPABILITY,
  PRODUCT_ACCESS_REGISTRY,
  resolveProductPlan,
  type AccessRegistry,
} from './registry.js';
import type { OrganizationAccessInputs } from './ports.js';
import {
  buildAccessDocument,
  normalizeSubscriptionStatus,
  resolveEffectiveCapabilities,
  resolveEffectiveLimit,
  resolveSubscriptionMode,
} from './resolve-access.js';

/**
 * Access policy decides what an Organization has bought or been granted. These
 * tests pin the three things E1 promises: the one-Station `CORE` baseline,
 * additive-only grants, and a document filtered by Role before it leaves the
 * server. No production capability is registered yet, so capability behaviour
 * is exercised against a test registry — which is also how a future feature
 * gets gated without editing the shipped one.
 */

const testRegistry: AccessRegistry = {
  plans: {
    CORE: { key: 'CORE', capabilities: ['reports.dealer_margin'], limits: { station_count: 1 } },
  },
  capabilities: {
    'reports.dealer_margin': {
      key: 'reports.dealer_margin',
      title: 'Dealer margin report',
      unavailableMessage: 'The dealer margin report is not available for this Organization.',
      resolution: 'CONTACT_PUMPOS',
      upgradable: true,
    },
    'exports.tally': {
      key: 'exports.tally',
      title: 'Tally export',
      unavailableMessage: 'Tally export is not available for this Organization.',
      resolution: 'CONTACT_PUMPOS',
      upgradable: true,
    },
    'integrations.secret': {
      key: 'integrations.secret',
      title: 'Unannounced integration',
      unavailableMessage: 'Not available.',
      resolution: 'CONTACT_PUMPOS',
      upgradable: false,
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

const documentFor = (role: Role, over: Partial<OrganizationAccessInputs> = {}) =>
  buildAccessDocument({ inputs: inputs(over), role, registry: testRegistry });

describe('the CORE baseline', () => {
  it('carries no capability in the CORE plan: every baseline feature ships ungated', () => {
    expect(PRODUCT_ACCESS_REGISTRY.plans.CORE.capabilities).toEqual([]);
  });

  it('registers the Attendant Handover Report as a grant-only capability', () => {
    const definition = PRODUCT_ACCESS_REGISTRY.capabilities[ATTENDANT_REPORT_CAPABILITY];
    expect(definition).toBeDefined();
    expect(definition.title).toBe('Attendant Handover Report');
    // Belongs to no plan — an Organization obtains it only by platform grant
    // until the second-tier Product Plan exists.
    expect(PRODUCT_ACCESS_REGISTRY.plans.CORE.capabilities).not.toContain(
      ATTENDANT_REPORT_CAPABILITY,
    );
  });

  it('allows exactly one Station', () => {
    expect(PRODUCT_ACCESS_REGISTRY.plans.CORE.limits.station_count).toBe(1);
  });

  it('falls back to CORE for a missing or unknown stored plan', () => {
    expect(resolveProductPlan(null).key).toBe('CORE');
    expect(resolveProductPlan('ENTERPRISE_2029').key).toBe('CORE');
  });

  it('reports the one-Station Limit as reached once a Station exists', () => {
    const doc = documentFor('Owner', { usage: { station_count: 1 } });
    expect(doc.limits.station_count).toEqual({ value: 1, used: 1, reached: true });
  });

  it('reports the Limit as available to an Organization with no Station yet', () => {
    const doc = documentFor('Owner', { usage: { station_count: 0 } });
    expect(doc.limits.station_count).toEqual({ value: 1, used: 0, reached: false });
  });

  it('lets an Organization Limit override replace the plan value', () => {
    const doc = documentFor('Owner', {
      limitOverrides: { station_count: 4 },
      usage: { station_count: 2 },
    });
    expect(doc.limits.station_count).toEqual({ value: 4, used: 2, reached: false });
  });

  it('resolves an override even when it is lower than current usage', () => {
    const over = inputs({ limitOverrides: { station_count: 1 }, usage: { station_count: 3 } });
    expect(resolveEffectiveLimit('station_count', over)).toBe(1);
    expect(buildAccessDocument({ inputs: over, role: 'Owner' }).limits.station_count.reached).toBe(
      true,
    );
  });
});

describe('effective capabilities', () => {
  it('adds active Organization grants to the plan capabilities', () => {
    const effective = resolveEffectiveCapabilities(
      inputs({ grantedCapabilities: ['exports.tally'] }),
      testRegistry,
    );
    expect([...effective].sort()).toEqual(['exports.tally', 'reports.dealer_margin']);
  });

  it('keeps plan capabilities when no grant exists', () => {
    const effective = resolveEffectiveCapabilities(inputs(), testRegistry);
    expect([...effective]).toEqual(['reports.dealer_margin']);
  });

  it('ignores a grant for a key this build does not implement', () => {
    const effective = resolveEffectiveCapabilities(
      inputs({ grantedCapabilities: ['exports.unbuilt'] }),
      testRegistry,
    );
    expect(effective.has('exports.unbuilt')).toBe(false);
  });
});

describe('Role filtering of the Access Document', () => {
  it('gives Owners and Managers the Product Plan key', () => {
    expect(documentFor('Owner').plan).toBe('CORE');
    expect(documentFor('Manager').plan).toBe('CORE');
  });

  it.each<Role>(['Accountant', 'Staff', 'Attendant'])('withholds the Plan key from %s', (role) => {
    expect(documentFor(role).plan).toBeUndefined();
    expect('plan' in documentFor(role)).toBe(false);
  });

  it('shows Owners a disabled upgrade entry for an unentitled capability', () => {
    expect(documentFor('Owner').capabilities['exports.tally']).toEqual({
      enabled: false,
      title: 'Tally export',
      visibility: 'UPGRADE',
      unavailableMessage: 'Tally export is not available for this Organization.',
      resolution: 'CONTACT_PUMPOS',
    });
  });

  it.each<Role>(['Accountant', 'Staff', 'Attendant'])(
    'sends %s enabled entries only — never an upgrade prompt',
    (role) => {
      const capabilities = documentFor(role).capabilities;
      expect(capabilities['exports.tally']).toBeUndefined();
      expect(capabilities['reports.dealer_margin']).toEqual({
        enabled: true,
        title: 'Dealer margin report',
      });
      expect(Object.values(capabilities).every((entry) => entry.enabled)).toBe(true);
    },
  );

  it('never announces an unentitled capability that is not upgradable', () => {
    expect(documentFor('Owner').capabilities['integrations.secret']).toBeUndefined();
  });

  it('shows a granted capability as enabled, with no unavailable message', () => {
    const doc = documentFor('Owner', { grantedCapabilities: ['exports.tally'] });
    expect(doc.capabilities['exports.tally']).toEqual({
      enabled: true,
      title: 'Tally export',
    });
  });
});

describe('subscription resolution', () => {
  // What a *missing* paid-through instant means differs by status: mid-grace
  // or mid-trial there is simply no deadline recorded yet, while a canceled
  // subscription with no date has nothing left to honour. Boundary behaviour
  // around a real instant is covered in subscription-lifecycle.test.ts.
  it.each([
    ['TRIALING', 'NORMAL'],
    ['ACTIVE', 'NORMAL'],
    ['PAST_DUE', 'NORMAL'],
    ['RESTRICTED', 'RESTRICTED'],
    ['CANCELED', 'RESTRICTED'],
    ['SUSPENDED', 'SUSPENDED'],
  ] as const)('resolves %s to %s while no access window has been set', (status, mode) => {
    expect(resolveSubscriptionMode(status)).toBe(mode);
  });

  it('never leaves a canceled Organization with normal access forever', () => {
    // The bug this replaced: "no instant means the window is open" granted a
    // canceled subscription permanent access.
    expect(resolveSubscriptionMode('CANCELED', { accessUntil: null })).toBe('RESTRICTED');
  });

  it('normalizes the legacy stored values the migration rewrites', () => {
    expect(normalizeSubscriptionStatus('Active')).toBe('ACTIVE');
    expect(normalizeSubscriptionStatus('Deactivated')).toBe('SUSPENDED');
    expect(normalizeSubscriptionStatus('Revoked')).toBe('SUSPENDED');
  });

  // Fails closed now that the status gates writes (#168): an unreadable value
  // must not grant normal access. RESTRICTED is the gentlest safe answer — the
  // open day can still be finished, but nothing new starts.
  it('treats an unreadable status as RESTRICTED rather than granting full access', () => {
    expect(normalizeSubscriptionStatus('nonsense')).toBe('RESTRICTED');
    expect(normalizeSubscriptionStatus(undefined)).toBe('RESTRICTED');
  });

  it('treats a missing Organization row as RESTRICTED, not as a healthy default', () => {
    expect(normalizeSubscriptionStatus(null)).toBe('RESTRICTED');
  });

  it('warns Owners and Managers about a failed payment', () => {
    const doc = documentFor('Manager', { subscriptionStatus: 'PAST_DUE' });
    expect(doc.subscription.mode).toBe('NORMAL');
    expect(doc.subscription.showWarning).toBe(true);
    expect(doc.subscription.warningMessage).toContain('payment');
  });

  it('tells an Accountant about a failed payment: they are the one who chases it', () => {
    const doc = documentFor('Accountant', { subscriptionStatus: 'PAST_DUE' });
    expect(doc.subscription.showWarning).toBe(true);
    expect(doc.subscription.resolution).toBe('COMPLETE_PAYMENT');
  });

  it.each<Role>(['Staff', 'Attendant'])('withholds payment detail from %s', (role) => {
    const doc = documentFor(role, { subscriptionStatus: 'PAST_DUE' });
    expect(doc.subscription.showWarning).toBe(false);
    expect(doc.subscription.warningMessage).toBeNull();
  });

  it('passes the paid-through instant through untouched', () => {
    const doc = documentFor('Owner', { accessUntil: '2026-10-01T00:00:00.000Z' });
    expect(doc.subscription.accessUntil).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('GetAccessDocument', () => {
  const ctx: ExecutionContext = {
    organizationId: 'org-1',
    stationId: null,
    businessDayId: null,
    actorId: 'user-1',
    correlationId: 'correlation-1',
    clock: new FixedClock(new Date('2026-09-19T08:00:00.000Z')),
    ids: new SequentialIdGenerator('id'),
  };

  it('resolves the document for the caller Organization and Role', async () => {
    const loaded: string[] = [];
    const useCase = new GetAccessDocument({
      access: {
        load: async (organizationId) => {
          loaded.push(organizationId);
          return inputs({ usage: { station_count: 2 }, limitOverrides: { station_count: 3 } });
        },
      },
      registry: testRegistry,
    });

    const result = await useCase.execute({ role: 'Owner' }, ctx);

    expect(loaded).toEqual(['org-1']);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.plan).toBe('CORE');
    expect(result.data.limits.station_count).toEqual({ value: 3, used: 2, reached: false });
  });
});
