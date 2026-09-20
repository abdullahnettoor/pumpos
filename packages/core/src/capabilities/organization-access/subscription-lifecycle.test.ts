import { describe, expect, it } from 'vitest';
import type { Role } from '@pump/shared';
import { PAYMENT_GRACE_DAYS } from '@pump/shared';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../kernel/index.js';
import type { ExecutionContext } from '../../kernel/index.js';
import {
  ConfirmOrganizationPayment,
  RestoreOrganization,
  SetOrganizationPlan,
  SetOrganizationSubscriptionStatus,
  SuspendOrganization,
} from './subscription-lifecycle.js';
import type { OrganizationSubscription, PlatformActor } from './admin-ports.js';
import {
  buildAccessDocument,
  paymentGraceUntil,
  resolveAccessMode,
  resolveSubscriptionMode,
} from './resolve-access.js';
import type { OrganizationAccessInputs } from './ports.js';

/**
 * The subscription lifecycle, evaluated at request time.
 *
 * The behaviour worth pinning is what happens around `access_until`: an
 * Organization inside its Payment Grace Period works normally, and the very
 * next request after the window closes is Restricted — with no scheduled job
 * involved, so nothing can fail to run.
 */

const NOW = new Date('2026-09-20T10:00:00.000Z');
const actor: PlatformActor = { email: 'admin@pumpos.app', subjectId: 'auth-1' };

const ctx = (now: Date = NOW): ExecutionContext => ({
  organizationId: 'org-1',
  stationId: null,
  businessDayId: null,
  actorId: null,
  correlationId: 'correlation-1',
  actorSnapshot: {
    kind: 'platform_admin',
    displayName: actor.email,
    role: 'Platform Admin',
    subjectId: actor.subjectId,
  },
  clock: new FixedClock(now),
  ids: new SequentialIdGenerator('id'),
});

class FakeSubscriptions {
  constructor(public state: OrganizationSubscription | null) {}
  async load() {
    return this.state;
  }
  async setStatus(input: { status: string; accessUntil: string | null }) {
    this.state = { ...(this.state as OrganizationSubscription), ...input };
  }
  async setPlan(input: { plan: string }) {
    this.state = { ...(this.state as OrganizationSubscription), plan: input.plan };
  }
  async setSuspension(input: { suspendedAt: string | null }) {
    this.state = { ...(this.state as OrganizationSubscription), suspendedAt: input.suspendedAt };
  }
}

function harness(initial: Partial<OrganizationSubscription> = {}) {
  const subscriptions = new FakeSubscriptions({
    plan: 'CORE',
    status: 'ACTIVE',
    accessUntil: null,
    suspendedAt: null,
    ...initial,
  });
  const store = new InMemoryEventStore();
  const deps = { subscriptions, events: new InProcessEventDispatcher({ store }) };
  return { subscriptions, store, deps };
}

const inputs = (over: Partial<OrganizationAccessInputs> = {}): OrganizationAccessInputs => ({
  plan: 'CORE',
  subscriptionStatus: 'ACTIVE',
  accessUntil: null,
  grantedCapabilities: [],
  limitOverrides: {},
  usage: { station_count: 1 },
  ...over,
});

const subscriptionFor = (role: Role, over: Partial<OrganizationAccessInputs>, now = NOW) =>
  buildAccessDocument({ inputs: inputs(over), role, now }).subscription;

describe('moving an Organization through the lifecycle', () => {
  it('applies the seven-day Payment Grace Period when PAST_DUE arrives without an instant', async () => {
    const { subscriptions, store, deps } = harness();

    const result = await new SetOrganizationSubscriptionStatus(deps).execute(
      { status: 'PAST_DUE', actor, reason: 'card declined' },
      ctx(),
    );

    expect(result.success && result.data.changed).toBe(true);
    expect(subscriptions.state).toMatchObject({
      status: 'PAST_DUE',
      accessUntil: paymentGraceUntil(NOW),
    });
    // Seven days, expressed as an instant rather than a scheduled transition.
    expect(Date.parse(paymentGraceUntil(NOW)) - NOW.getTime()).toBe(
      PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(store.events.map((e) => e.eventType)).toEqual([
      'ORGANIZATION_SUBSCRIPTION_STATUS_CHANGED',
    ]);
    expect(store.events[0].payload).toMatchObject({
      previousStatus: 'ACTIVE',
      status: 'PAST_DUE',
      reason: 'card declined',
    });
  });

  it('honours an explicit paid-through instant, e.g. a cancellation at period end', async () => {
    const { subscriptions, deps } = harness();
    const until = '2026-10-15T00:00:00.000Z';

    await new SetOrganizationSubscriptionStatus(deps).execute(
      { status: 'CANCELED', accessUntil: until, actor },
      ctx(),
    );

    expect(subscriptions.state).toMatchObject({ status: 'CANCELED', accessUntil: until });
  });

  it('clears a stale window when moving to a status that has none', async () => {
    // Otherwise an instant left over from PAST_DUE would keep granting access.
    const { subscriptions, deps } = harness({
      status: 'PAST_DUE',
      accessUntil: '2030-01-01T00:00:00.000Z',
    });

    await new SetOrganizationSubscriptionStatus(deps).execute(
      { status: 'SUSPENDED', actor },
      ctx(),
    );

    expect(subscriptions.state).toMatchObject({ status: 'SUSPENDED', accessUntil: null });
  });

  it('is idempotent: re-sending the same state writes nothing and emits nothing', async () => {
    const { store, deps } = harness({ status: 'SUSPENDED', accessUntil: null });

    const result = await new SetOrganizationSubscriptionStatus(deps).execute(
      { status: 'SUSPENDED', actor },
      ctx(),
    );

    expect(result.success && result.data.changed).toBe(false);
    expect(store.events).toHaveLength(0);
  });

  it('rejects an unknown status before writing', async () => {
    const { subscriptions, store, deps } = harness();

    const result = await new SetOrganizationSubscriptionStatus(deps).execute(
      { status: 'LAPSED', actor },
      ctx(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('LAPSED');
    expect(subscriptions.state).toMatchObject({ status: 'ACTIVE' });
    expect(store.events).toHaveLength(0);
  });

  it('rejects an unparseable access-until instant', async () => {
    const { store, deps } = harness();

    const result = await new SetOrganizationSubscriptionStatus(deps).execute(
      { status: 'CANCELED', accessUntil: 'next tuesday', actor },
      ctx(),
    );

    expect(result.success).toBe(false);
    expect(store.events).toHaveLength(0);
  });
});

describe('confirming payment', () => {
  it('restores ACTIVE immediately and clears the grace window', async () => {
    const { subscriptions, store, deps } = harness({
      status: 'RESTRICTED',
      accessUntil: '2026-09-01T00:00:00.000Z',
    });

    const result = await new ConfirmOrganizationPayment(deps).execute({ actor }, ctx());

    expect(result.success && result.data.changed).toBe(true);
    expect(subscriptions.state).toMatchObject({ status: 'ACTIVE', accessUntil: null });
    expect(store.events[0].payload).toMatchObject({
      previousStatus: 'RESTRICTED',
      status: 'ACTIVE',
      reason: 'payment confirmed',
    });
  });

  it('is a no-op for an Organization that is already ACTIVE', async () => {
    const { store, deps } = harness({ status: 'ACTIVE', accessUntil: null });

    const result = await new ConfirmOrganizationPayment(deps).execute({ actor }, ctx());

    expect(result.success && result.data.changed).toBe(false);
    expect(store.events).toHaveLength(0);
  });
});

describe('assigning a Product Plan', () => {
  it('rejects a plan this build does not define', async () => {
    const { subscriptions, store, deps } = harness();

    const result = await new SetOrganizationPlan(deps).execute(
      { plan: 'ENTERPRISE', actor },
      ctx(),
    );

    expect(result.success).toBe(false);
    expect(subscriptions.state).toMatchObject({ plan: 'CORE' });
    expect(store.events).toHaveLength(0);
  });

  it('is a no-op when the Organization already holds the plan', async () => {
    const { store, deps } = harness({ plan: 'CORE' });

    const result = await new SetOrganizationPlan(deps).execute({ plan: 'CORE', actor }, ctx());

    expect(result.success && result.data.changed).toBe(false);
    expect(store.events).toHaveLength(0);
  });

  it('records the change with both values when the plan actually moves', async () => {
    const { subscriptions, store, deps } = harness({ plan: 'LEGACY_TRIAL' });

    const result = await new SetOrganizationPlan(deps).execute(
      { plan: 'core', actor, reason: 'migrated' },
      ctx(),
    );

    expect(result.success && result.data.changed).toBe(true);
    expect(subscriptions.state).toMatchObject({ plan: 'CORE' });
    expect(store.events.map((e) => e.eventType)).toEqual(['ORGANIZATION_PLAN_CHANGED']);
    expect(store.events[0].payload).toMatchObject({ previousPlan: 'LEGACY_TRIAL', plan: 'CORE' });
  });
});

describe('the access window boundary', () => {
  const until = '2026-09-20T10:00:00.000Z';
  const instant = (offsetMs: number) => new Date(Date.parse(until) + offsetMs);

  it.each([
    ['a minute before', -60_000, 'NORMAL'],
    ['a millisecond before', -1, 'NORMAL'],
    ['exactly at the instant', 0, 'RESTRICTED'],
    ['a millisecond after', 1, 'RESTRICTED'],
    ['a day after', 24 * 60 * 60_000, 'RESTRICTED'],
  ] as const)('PAST_DUE resolves %s as %s', (_label, offset, mode) => {
    expect(resolveSubscriptionMode('PAST_DUE', { accessUntil: until, now: instant(offset) })).toBe(
      mode,
    );
  });

  it.each([
    ['before', -1, 'NORMAL'],
    ['after', 1, 'RESTRICTED'],
  ] as const)(
    'CANCELED keeps paid-for access until the instant, then stops (%s)',
    (_l, offset, mode) => {
      expect(
        resolveSubscriptionMode('CANCELED', { accessUntil: until, now: instant(offset) }),
      ).toBe(mode);
    },
  );

  it('never grants a window to SUSPENDED, whatever the instant says', async () => {
    expect(
      resolveSubscriptionMode('SUSPENDED', { accessUntil: '2099-01-01T00:00:00.000Z', now: NOW }),
    ).toBe('SUSPENDED');
  });

  it('treats a missing window as open, so E1 rows are not restricted by a deploy', () => {
    expect(resolveSubscriptionMode('PAST_DUE', { accessUntil: null, now: NOW })).toBe('NORMAL');
  });
});

describe('what each Role is told about the subscription', () => {
  const pastDueInGrace = {
    subscriptionStatus: 'PAST_DUE',
    accessUntil: '2026-09-27T10:00:00.000Z',
  };

  it('gives Owners the warning, the deadline and the action', () => {
    const subscription = subscriptionFor('Owner', pastDueInGrace);

    expect(subscription).toMatchObject({
      status: 'PAST_DUE',
      mode: 'NORMAL',
      accessUntil: '2026-09-27T10:00:00.000Z',
      showWarning: true,
      resolution: 'COMPLETE_PAYMENT',
    });
    expect(subscription.warningMessage).toContain('2026-09-27');
  });

  it('gives Managers the same, since they resolve blockers when the Owner is away', () => {
    expect(subscriptionFor('Manager', pastDueInGrace).resolution).toBe('COMPLETE_PAYMENT');
  });

  it('gives Accountants the same, since chasing an overdue invoice is their job', () => {
    const subscription = subscriptionFor('Accountant', pastDueInGrace);

    expect(subscription).toMatchObject({
      showWarning: true,
      accessUntil: '2026-09-27T10:00:00.000Z',
      resolution: 'COMPLETE_PAYMENT',
    });
  });

  it('still withholds the buy-more prompt from an Accountant', () => {
    // Billing state is theirs; purchasing decisions are not.
    const document = buildAccessDocument({
      inputs: inputs(pastDueInGrace),
      role: 'Accountant',
      now: NOW,
    });

    expect(document.plan).toBeUndefined();
  });

  it.each<Role>(['Staff', 'Attendant'])(
    'tells %s nothing at all while access is still normal',
    (role) => {
      expect(subscriptionFor(role, pastDueInGrace)).toMatchObject({
        status: 'PAST_DUE',
        mode: 'NORMAL',
        accessUntil: null,
        showWarning: false,
        warningMessage: null,
        resolution: null,
      });
    },
  );

  it.each<Role>(['Staff', 'Attendant'])(
    'tells %s that access is restricted, without any billing detail',
    (role) => {
      const subscription = subscriptionFor(role, {
        subscriptionStatus: 'PAST_DUE',
        accessUntil: '2026-09-01T00:00:00.000Z',
      });

      expect(subscription.mode).toBe('RESTRICTED');
      expect(subscription.showWarning).toBe(true);
      expect(subscription.resolution).toBe('CONTACT_OWNER_OR_MANAGER');
      expect(subscription.accessUntil).toBeNull();
      expect(subscription.warningMessage).not.toMatch(/payment|overdue|subscription/i);
    },
  );

  it('tells an Owner of a suspended Organization to wait for reactivation', () => {
    expect(subscriptionFor('Owner', { subscriptionStatus: 'SUSPENDED' })).toMatchObject({
      mode: 'SUSPENDED',
      resolution: 'WAIT_FOR_REACTIVATION',
    });
  });

  it('says nothing to anyone while the subscription is healthy', () => {
    expect(subscriptionFor('Owner', { subscriptionStatus: 'ACTIVE' })).toMatchObject({
      showWarning: false,
      warningMessage: null,
      resolution: null,
    });
  });
});

/** The access mode the stored state actually resolves to. */
const modeOf = (state: OrganizationSubscription | null, now = NOW) =>
  resolveAccessMode(
    inputs({
      subscriptionStatus: state?.status ?? null,
      accessUntil: state?.accessUntil ?? null,
      suspendedAt: state?.suspendedAt ?? null,
    }),
    now,
  );

describe('suspension is independent of billing', () => {
  it('records the stop without touching the billing lifecycle', async () => {
    // An Organization mid-grace that gets suspended is still mid-grace when
    // it is restored; suspension answers a different question.
    const { subscriptions, store, deps } = harness({
      status: 'PAST_DUE',
      accessUntil: '2026-09-27T10:00:00.000Z',
    });

    const result = await new SuspendOrganization(deps).execute({ actor, reason: 'fraud' }, ctx());

    expect(result.success && result.data.changed).toBe(true);
    expect(subscriptions.state).toMatchObject({
      status: 'PAST_DUE',
      accessUntil: '2026-09-27T10:00:00.000Z',
      suspendedAt: NOW.toISOString(),
    });
    expect(store.events.map((e) => e.eventType)).toEqual(['ORGANIZATION_DEACTIVATED']);
  });

  it('cannot be cleared by paying an invoice', async () => {
    // The defect this design replaced: suspension lived in the status column,
    // so a confirmed payment overwrote it and a suspended Organization could
    // lift its own stop.
    const { subscriptions, deps } = harness({
      status: 'PAST_DUE',
      accessUntil: null,
      suspendedAt: '2026-09-01T00:00:00.000Z',
    });

    await new ConfirmOrganizationPayment(deps).execute({ actor }, ctx());

    expect(subscriptions.state).toMatchObject({
      status: 'ACTIVE',
      suspendedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(modeOf(subscriptions.state)).toBe('SUSPENDED');
  });

  it('is not lifted by a subscription status change either', async () => {
    const { subscriptions, deps } = harness({
      status: 'RESTRICTED',
      suspendedAt: '2026-09-01T00:00:00.000Z',
    });

    await new SetOrganizationSubscriptionStatus(deps).execute({ status: 'ACTIVE', actor }, ctx());

    expect(subscriptions.state).toMatchObject({ suspendedAt: '2026-09-01T00:00:00.000Z' });
  });

  it('suspending twice is a no-op', async () => {
    const { store, deps } = harness({ suspendedAt: '2026-09-01T00:00:00.000Z' });

    const result = await new SuspendOrganization(deps).execute({ actor }, ctx());

    expect(result.success && result.data.changed).toBe(false);
    expect(store.events).toHaveLength(0);
  });

  it('restoring returns the Organization to its billing state, not to ACTIVE', async () => {
    // Restoring is not the same as paying: an Organization stopped while
    // overdue is overdue again once the stop is lifted.
    const { subscriptions, store, deps } = harness({
      status: 'PAST_DUE',
      accessUntil: '2026-09-01T00:00:00.000Z',
      suspendedAt: '2026-09-02T00:00:00.000Z',
    });

    const result = await new RestoreOrganization(deps).execute({ actor }, ctx());

    expect(result.success && result.data.changed).toBe(true);
    expect(subscriptions.state).toMatchObject({ status: 'PAST_DUE', suspendedAt: null });
    expect(store.events.map((e) => e.eventType)).toEqual(['ORGANIZATION_REACTIVATED']);
    // The grace period had already lapsed, so it is Restricted again.
    expect(modeOf(subscriptions.state)).toBe('RESTRICTED');
  });

  it('restoring an Organization that was never suspended is a no-op', async () => {
    const { store, deps } = harness({ suspendedAt: null });

    const result = await new RestoreOrganization(deps).execute({ actor }, ctx());

    expect(result.success && result.data.changed).toBe(false);
    expect(store.events).toHaveLength(0);
  });

  it('outranks every billing state while it stands', () => {
    for (const status of ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'RESTRICTED'] as const) {
      expect(
        resolveAccessMode(
          inputs({ subscriptionStatus: status, suspendedAt: '2026-09-01T00:00:00.000Z' }),
          NOW,
        ),
      ).toBe('SUSPENDED');
    }
  });
});
