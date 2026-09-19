import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../kernel/index.js';
import type { ExecutionContext } from '../../kernel/index.js';
import {
  ClearOrganizationLimitOverride,
  GrantOrganizationCapability,
  RevokeOrganizationCapability,
  SetOrganizationLimitOverride,
} from './administer-access.js';
import type {
  CapabilityGrant,
  LimitOverride,
  OrganizationAccessAdminRepository,
  PlatformActor,
} from './admin-ports.js';
import type { AccessRegistry } from './registry.js';

/**
 * Platform administration of Organization access. The promises under test are
 * the ones support depends on: a command is rejected before it writes if the
 * key is not something this build implements, a repeated command is a no-op
 * with no row and no event, and every real change carries its audit event.
 *
 * No capability is registered in production yet, so capability commands run
 * against a test registry — which is also how a future feature gets gated.
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

const actor: PlatformActor = { email: 'admin@pumpos.app', subjectId: 'auth-1' };

/** In-memory append-only store with the same active-row rule as the database. */
class FakeRepository implements OrganizationAccessAdminRepository {
  grants: CapabilityGrant[] = [];
  overrides: LimitOverride[] = [];
  private seq = 0;

  private id() {
    this.seq += 1;
    return `row-${this.seq}`;
  }

  async findActiveGrant(organizationId: string, capabilityKey: string) {
    return (
      this.grants.find(
        (g) =>
          g.organizationId === organizationId &&
          g.capabilityKey === capabilityKey &&
          g.revokedAt === null,
      ) ?? null
    );
  }

  async listGrants(organizationId: string) {
    return this.grants.filter((g) => g.organizationId === organizationId);
  }

  async insertGrant(input: {
    organizationId: string;
    capabilityKey: string;
    actor: PlatformActor;
    reason: string | null;
  }) {
    const active = await this.findActiveGrant(input.organizationId, input.capabilityKey);
    if (active) throw new Error('active grant already exists');
    const grant: CapabilityGrant = {
      id: this.id(),
      organizationId: input.organizationId,
      capabilityKey: input.capabilityKey,
      grantedByEmail: input.actor.email,
      grantedBySubject: input.actor.subjectId,
      reason: input.reason,
      createdAt: '2026-09-19T08:00:00.000Z',
      revokedAt: null,
      revokedByEmail: null,
      revokedBySubject: null,
    };
    this.grants.push(grant);
    return grant;
  }

  async revokeGrant(id: string, revokedBy: PlatformActor) {
    const grant = this.grants.find((g) => g.id === id)!;
    grant.revokedAt = '2026-09-19T09:00:00.000Z';
    grant.revokedByEmail = revokedBy.email;
    grant.revokedBySubject = revokedBy.subjectId;
    return grant;
  }

  async findActiveOverride(organizationId: string, limitKey: string) {
    return (
      this.overrides.find(
        (o) =>
          o.organizationId === organizationId && o.limitKey === limitKey && o.revokedAt === null,
      ) ?? null
    );
  }

  async listOverrides(organizationId: string) {
    return this.overrides.filter((o) => o.organizationId === organizationId);
  }

  async insertOverride(input: {
    organizationId: string;
    limitKey: 'station_count';
    value: number;
    actor: PlatformActor;
    reason: string;
  }) {
    const active = await this.findActiveOverride(input.organizationId, input.limitKey);
    if (active) throw new Error('active override already exists');
    const override: LimitOverride = {
      id: this.id(),
      organizationId: input.organizationId,
      limitKey: input.limitKey,
      value: input.value,
      assignedByEmail: input.actor.email,
      assignedBySubject: input.actor.subjectId,
      reason: input.reason,
      createdAt: '2026-09-19T08:00:00.000Z',
      revokedAt: null,
      revokedByEmail: null,
      revokedBySubject: null,
    };
    this.overrides.push(override);
    return override;
  }

  async revokeOverride(id: string, revokedBy: PlatformActor) {
    const override = this.overrides.find((o) => o.id === id)!;
    override.revokedAt = '2026-09-19T09:00:00.000Z';
    override.revokedByEmail = revokedBy.email;
    override.revokedBySubject = revokedBy.subjectId;
    return override;
  }
}

const ctx = (): ExecutionContext => ({
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
  clock: new FixedClock(new Date('2026-09-19T08:00:00.000Z')),
  ids: new SequentialIdGenerator('id'),
});

function harness() {
  const repository = new FakeRepository();
  const store = new InMemoryEventStore();
  const deps = { repository, events: new InProcessEventDispatcher({ store }), registry };
  return { repository, store, deps };
}

describe('granting a Product Capability', () => {
  it('records the grant with the platform actor and emits the event', async () => {
    const { repository, store, deps } = harness();

    const result = await new GrantOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor, reason: 'Pilot customer' },
      ctx(),
    );

    expect(result.success && result.data.changed).toBe(true);
    expect(repository.grants).toHaveLength(1);
    expect(repository.grants[0]).toMatchObject({
      capabilityKey: 'exports.tally',
      grantedByEmail: 'admin@pumpos.app',
      grantedBySubject: 'auth-1',
      reason: 'Pilot customer',
      revokedAt: null,
    });
    expect(store.events.map((e) => e.eventType)).toEqual(['ORGANIZATION_CAPABILITY_GRANTED']);
  });

  it('is idempotent: repeating it writes no row and emits no event', async () => {
    const { repository, store, deps } = harness();
    await new GrantOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor },
      ctx(),
    );

    const second = await new GrantOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor },
      ctx(),
    );

    expect(second.success && second.data.changed).toBe(false);
    expect(repository.grants).toHaveLength(1);
    expect(store.events).toHaveLength(1);
  });

  it('rejects a key this build does not implement, before writing anything', async () => {
    const { repository, store, deps } = harness();

    const result = await new GrantOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.unbuilt', actor },
      ctx(),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toContain('exports.unbuilt');
    expect(repository.grants).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });
});

describe('revoking and regranting', () => {
  it('closes the active row and emits the revocation event', async () => {
    const { repository, store, deps } = harness();
    await new GrantOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor },
      ctx(),
    );

    const result = await new RevokeOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor, reason: 'Pilot ended' },
      ctx(),
    );

    expect(result.success && result.data.changed).toBe(true);
    expect(repository.grants[0].revokedAt).not.toBeNull();
    expect(repository.grants[0].revokedByEmail).toBe('admin@pumpos.app');
    expect(store.events.map((e) => e.eventType)).toEqual([
      'ORGANIZATION_CAPABILITY_GRANTED',
      'ORGANIZATION_CAPABILITY_REVOKED',
    ]);
  });

  it('revoking twice is a no-op', async () => {
    const { store, deps } = harness();
    await new GrantOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor },
      ctx(),
    );
    await new RevokeOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor },
      ctx(),
    );

    const again = await new RevokeOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor },
      ctx(),
    );

    expect(again.success && again.data.changed).toBe(false);
    expect(store.events).toHaveLength(2);
  });

  it('regranting inserts a new row so each access period stays visible', async () => {
    const { repository, deps } = harness();
    await new GrantOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor },
      ctx(),
    );
    await new RevokeOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor },
      ctx(),
    );

    const regrant = await new GrantOrganizationCapability(deps).execute(
      { capabilityKey: 'exports.tally', actor, reason: 'Renewed' },
      ctx(),
    );

    expect(regrant.success && regrant.data.changed).toBe(true);
    expect(repository.grants).toHaveLength(2);
    expect(repository.grants.filter((g) => g.revokedAt === null)).toHaveLength(1);
  });
});

describe('Limit overrides', () => {
  it('records an override with its required reason and emits the event', async () => {
    const { repository, store, deps } = harness();

    const result = await new SetOrganizationLimitOverride(deps).execute(
      { limitKey: 'station_count', value: 3, actor, reason: 'Three-site contract' },
      ctx(),
    );

    expect(result.success && result.data.changed).toBe(true);
    expect(repository.overrides[0]).toMatchObject({
      limitKey: 'station_count',
      value: 3,
      reason: 'Three-site contract',
      assignedByEmail: 'admin@pumpos.app',
    });
    expect(store.events.map((e) => e.eventType)).toEqual(['ORGANIZATION_LIMIT_OVERRIDE_SET']);
  });

  it('requires a reason', async () => {
    const { repository, deps } = harness();

    const result = await new SetOrganizationLimitOverride(deps).execute(
      { limitKey: 'station_count', value: 3, actor, reason: '   ' },
      ctx(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toMatch(/reason is required/i);
    expect(repository.overrides).toHaveLength(0);
  });

  it.each([0, -2, 1.5])('rejects a non-positive or fractional value (%s)', async (value) => {
    const { repository, deps } = harness();

    const result = await new SetOrganizationLimitOverride(deps).execute(
      { limitKey: 'station_count', value, actor, reason: 'why' },
      ctx(),
    );

    expect(result.success).toBe(false);
    expect(repository.overrides).toHaveLength(0);
  });

  it('rejects an unknown Limit key', async () => {
    const { repository, deps } = harness();

    const result = await new SetOrganizationLimitOverride(deps).execute(
      { limitKey: 'user_count', value: 5, actor, reason: 'why' },
      ctx(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('user_count');
    expect(repository.overrides).toHaveLength(0);
  });

  it('replaces an active override by closing it and inserting the new value', async () => {
    const { repository, store, deps } = harness();
    await new SetOrganizationLimitOverride(deps).execute(
      { limitKey: 'station_count', value: 3, actor, reason: 'Three sites' },
      ctx(),
    );

    const replaced = await new SetOrganizationLimitOverride(deps).execute(
      { limitKey: 'station_count', value: 5, actor, reason: 'Expanded to five' },
      ctx(),
    );

    expect(replaced.success && replaced.data.changed).toBe(true);
    expect(repository.overrides).toHaveLength(2);
    // History is never edited in place: the old value survives, closed.
    expect(repository.overrides[0]).toMatchObject({
      value: 3,
      revokedAt: '2026-09-19T09:00:00.000Z',
    });
    expect(repository.overrides.filter((o) => o.revokedAt === null)).toEqual([
      expect.objectContaining({ value: 5 }),
    ]);
    const setEvent = store.events[1];
    expect(setEvent.payload).toMatchObject({ previousValue: 3, value: 5 });
  });

  it('setting the same value again is a no-op', async () => {
    const { repository, store, deps } = harness();
    await new SetOrganizationLimitOverride(deps).execute(
      { limitKey: 'station_count', value: 3, actor, reason: 'Three sites' },
      ctx(),
    );

    const again = await new SetOrganizationLimitOverride(deps).execute(
      { limitKey: 'station_count', value: 3, actor, reason: 'Three sites' },
      ctx(),
    );

    expect(again.success && again.data.changed).toBe(false);
    expect(repository.overrides).toHaveLength(1);
    expect(store.events).toHaveLength(1);
  });

  it('clears an override and emits the event', async () => {
    const { repository, store, deps } = harness();
    await new SetOrganizationLimitOverride(deps).execute(
      { limitKey: 'station_count', value: 3, actor, reason: 'Three sites' },
      ctx(),
    );

    const cleared = await new ClearOrganizationLimitOverride(deps).execute(
      { limitKey: 'station_count', actor, reason: 'Contract ended' },
      ctx(),
    );

    expect(cleared.success && cleared.data.changed).toBe(true);
    expect(repository.overrides.filter((o) => o.revokedAt === null)).toHaveLength(0);
    expect(store.events.map((e) => e.eventType)).toEqual([
      'ORGANIZATION_LIMIT_OVERRIDE_SET',
      'ORGANIZATION_LIMIT_OVERRIDE_CLEARED',
    ]);
  });

  it('clearing an absent override is a no-op', async () => {
    const { store, deps } = harness();

    const result = await new ClearOrganizationLimitOverride(deps).execute(
      { limitKey: 'station_count', actor },
      ctx(),
    );

    expect(result.success && result.data.changed).toBe(false);
    expect(store.events).toHaveLength(0);
  });
});
