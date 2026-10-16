import { describe, expect, it } from 'vitest';
import type { Role } from '@pump/shared';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  renderEventActivity,
  SequentialIdGenerator,
} from '../../kernel/index.js';
import type { ExecutionContext } from '../../kernel/index.js';
import type { OrganizationRecord } from './organization-payload.js';
import {
  UpdateOrganization,
  type OrganizationProfileRepository,
  type OrganizationProfileWrite,
} from './update-organization.js';

/**
 * An Owner edits the Organization profile (#634). The promises under test:
 * only an Owner may, the body is validated and only profile keys are written,
 * a real change commits with its ORGANIZATION_UPDATED event (which renders in
 * Activity), a no-op save writes nothing, and the result is shaped as GET is.
 */

const NOW = '2026-10-16T09:00:00.000Z';

const stored = (): OrganizationRecord => ({
  id: 'org-1',
  name: 'Sri Lakshmi Fuels',
  metadata: {
    legalName: 'Sri Lakshmi Fuels Pvt Ltd',
    gstin: '32AAACS1234A1Z5',
    integration: { tally: 'on' },
  },
  subscriptionPlan: 'CORE',
  subscriptionStatus: 'ACTIVE',
  accessUntil: null,
  isDemo: false,
  demoExpiresAt: null,
  suspendedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
});

class FakeRepository implements OrganizationProfileRepository {
  writes: OrganizationProfileWrite[] = [];
  constructor(public row: OrganizationRecord | null = stored()) {}
  async findById(id: string) {
    return this.row && this.row.id === id ? this.row : null;
  }
  async updateProfile(id: string, write: OrganizationProfileWrite) {
    if (!this.row || this.row.id !== id) throw new Error('missing row');
    this.writes.push(write);
    this.row = { ...this.row, ...write };
    return this.row;
  }
}

const ctx = (role: Role | null = 'Owner', kind: 'tenant_user' | 'system' = 'tenant_user') =>
  ({
    organizationId: 'org-1',
    stationId: null,
    businessDayId: null,
    actorId: 'user-1',
    correlationId: 'corr-1',
    actorSnapshot: { kind, displayName: 'Asha', role },
    groupingRole: 'primary',
    clock: new FixedClock(new Date(NOW)),
    ids: new SequentialIdGenerator('id'),
  }) satisfies ExecutionContext;

function harness(row?: OrganizationRecord | null) {
  const repository = new FakeRepository(row === undefined ? stored() : row);
  const store = new InMemoryEventStore();
  const useCase = new UpdateOrganization({
    repository,
    events: new InProcessEventDispatcher({ store }),
  });
  return { repository, store, useCase };
}

const body = {
  name: 'Sri Lakshmi Fuels LLP',
  metadata: { legalName: 'Sri Lakshmi Fuels Pvt Ltd', gstin: '32AAACS1234A1Z6', phone: '0495' },
};

describe('UpdateOrganization (#634)', () => {
  it('writes the profile and emits ORGANIZATION_UPDATED with what changed', async () => {
    const { repository, store, useCase } = harness();
    const result = await useCase.execute(body, ctx());

    expect(result.success).toBe(true);
    expect(repository.writes).toEqual([
      {
        name: 'Sri Lakshmi Fuels LLP',
        metadata: {
          integration: { tally: 'on' },
          legalName: 'Sri Lakshmi Fuels Pvt Ltd',
          gstin: '32AAACS1234A1Z6',
          phone: '0495',
        },
        updatedAt: NOW,
      },
    ]);

    expect(store.events).toHaveLength(1);
    const [event] = store.events;
    expect(event).toMatchObject({
      eventType: BusinessEvents.ORGANIZATION_UPDATED,
      organizationId: 'org-1',
      stationId: null,
      businessDayId: null,
      aggregateType: 'Organization',
      aggregateId: 'org-1',
      actorId: 'user-1',
      payload: {
        organizationId: 'org-1',
        name: 'Sri Lakshmi Fuels LLP',
        changes: {
          name: { from: 'Sri Lakshmi Fuels', to: 'Sri Lakshmi Fuels LLP' },
          gstin: { from: '32AAACS1234A1Z5', to: '32AAACS1234A1Z6' },
          phone: { from: null, to: '0495' },
        },
      },
    });
    expect(event.eventId).toBeTruthy();
    expect(renderEventActivity(event)).toMatchObject({
      title: 'Organization profile updated',
      description: 'Updated the organization name, GSTIN, phone.',
      renderStatus: 'rendered',
    });
  });

  it('returns the Organization shaped for the Owner, never the non-profile keys', async () => {
    const { useCase } = harness();
    const result = await useCase.execute(body, ctx());
    if (!result.success) throw new Error(result.error.message);
    expect(result.data).toMatchObject({
      id: 'org-1',
      name: 'Sri Lakshmi Fuels LLP',
      subscriptionPlan: 'CORE',
      updatedAt: NOW,
    });
    expect(result.data.metadata).toEqual({
      legalName: 'Sri Lakshmi Fuels Pvt Ltd',
      gstin: '32AAACS1234A1Z6',
      phone: '0495',
    });
  });

  it('clears a profile key the body omits, as a PUT does', async () => {
    const { repository, store, useCase } = harness();
    const result = await useCase.execute({ name: 'Sri Lakshmi Fuels' }, ctx());
    expect(result.success).toBe(true);
    expect(repository.writes[0].metadata).toEqual({ integration: { tally: 'on' } });
    expect(store.events[0].payload).toMatchObject({
      changes: {
        legalName: { from: 'Sri Lakshmi Fuels Pvt Ltd', to: null },
        gstin: { from: '32AAACS1234A1Z5', to: null },
      },
    });
  });

  it('drops keys outside the profile allowlist', async () => {
    const { repository, useCase } = harness();
    await useCase.execute(
      { name: body.name, metadata: { ...body.metadata, plan: 'ENTERPRISE', integration: 'off' } },
      ctx(),
    );
    expect(repository.writes[0].metadata).not.toHaveProperty('plan');
    expect(repository.writes[0].metadata).toHaveProperty('integration', { tally: 'on' });
  });

  it('writes nothing and emits nothing when the save changes nothing', async () => {
    const { repository, store, useCase } = harness();
    const result = await useCase.execute(
      {
        name: 'Sri Lakshmi Fuels',
        metadata: { legalName: 'Sri Lakshmi Fuels Pvt Ltd', gstin: '32AAACS1234A1Z5' },
      },
      ctx(),
    );
    expect(result.success).toBe(true);
    expect(repository.writes).toEqual([]);
    expect(store.events).toEqual([]);
  });

  it.each<Role>(['Manager', 'Accountant', 'Staff', 'Attendant'])(
    'refuses a %s with FORBIDDEN',
    async (role) => {
      const { repository, store, useCase } = harness();
      const result = await useCase.execute(body, ctx(role));
      expect(result).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      expect(repository.writes).toEqual([]);
      expect(store.events).toEqual([]);
    },
  );

  it('refuses an actor that is not a tenant User', async () => {
    const { useCase } = harness();
    const result = await useCase.execute(body, ctx('Owner', 'system'));
    expect(result).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('rejects an invalid body with the schema message', async () => {
    const { repository, useCase } = harness();
    const result = await useCase.execute({ name: 'S' }, ctx());
    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Organization name must be at least 2 characters',
      },
    });
    expect(repository.writes).toEqual([]);
  });

  it('answers NOT_FOUND when the Organization row is missing', async () => {
    const { useCase } = harness(null);
    const result = await useCase.execute(body, ctx());
    expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});
