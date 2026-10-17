import { describe, expect, it } from 'vitest';
import type { PermissionChanges, Role } from '@pump/shared';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  renderEventActivity,
  SequentialIdGenerator,
} from '../../kernel/index.js';
import type { ExecutionContext } from '../../kernel/index.js';
import type { OrganizationAccessInputs, UserPermissionChangesWriter } from './ports.js';
import {
  GetUserPermissions,
  PreviewUserRoleChange,
  SetUserPermissions,
} from './user-permissions.js';
import { UpdateUser } from '../station-setup/users/index.js';
import type { User, UserRepository } from '../station-setup/users/index.js';

const inputs = (granted: string[]): OrganizationAccessInputs => ({
  plan: 'CORE',
  subscriptionStatus: 'ACTIVE',
  accessUntil: null,
  grantedCapabilities: granted,
  limitOverrides: {},
  usage: { stations: 1 } as OrganizationAccessInputs['usage'],
});

class FakeChanges implements UserPermissionChangesWriter {
  rows = new Map<string, { granted: string[]; revoked: string[] }>();
  saves = 0;
  async load(_o: string, userId: string): Promise<PermissionChanges | null> {
    return this.rows.get(userId) ?? null;
  }
  async save(i: { userId: string; changes: { granted: string[]; revoked: string[] } }) {
    this.saves += 1;
    this.rows.set(i.userId, i.changes);
  }
  async clear(_o: string, userId: string) {
    this.rows.delete(userId);
  }
}

const member = (role: Role, org = 'org-1'): User => ({
  id: 'u-1',
  organizationId: org,
  authUserId: 'auth-u-1',
  fullName: 'Ravi',
  email: null,
  phone: null,
  role,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

function setup(user: User, opts: { entitled?: boolean } = {}) {
  const store = new InMemoryEventStore();
  const events = new InProcessEventDispatcher({ store });
  const changes = new FakeChanges();
  const rows = new Map([[user.id, user]]);
  const users: UserRepository = {
    findById: async (id: string) => rows.get(id) ?? null,
    save: async (u: User) => void rows.set(u.id, u),
    setStationAssignments: async () => {},
    listWithAssignments: async () => [],
  };
  const access = {
    load: async () => inputs(opts.entitled === false ? [] : ['permissions.custom']),
  };
  return { store, events, changes, users, access };
}

const ctx = (role: Role | null = 'Owner'): ExecutionContext => ({
  organizationId: 'org-1',
  stationId: null,
  businessDayId: null,
  actorId: 'owner-1',
  correlationId: 'corr-1',
  actorSnapshot: { kind: 'tenant_user', displayName: 'Asha', role },
  groupingRole: 'primary',
  clock: new FixedClock(new Date('2026-10-16T09:00:00.000Z')),
  ids: new SequentialIdGenerator('id'),
});

const published = async (store: InMemoryEventStore) => store.events;

describe('SetUserPermissions', () => {
  const run = (
    s: ReturnType<typeof setup>,
    body: { granted?: string[]; revoked?: string[] },
    actor: Role | null = 'Owner',
  ) =>
    new SetUserPermissions({
      users: s.users,
      changes: s.changes,
      access: s.access,
      events: s.events,
    }).execute({ userId: 'u-1', ...body }, ctx(actor));

  it('stores a revoke, emits one event with before/after, and returns the new view', async () => {
    const s = setup(member('Manager'));
    const r = await run(s, { revoked: ['purchases.viewCosts'] });
    expect(r.success).toBe(true);
    const stored = s.changes.rows.get('u-1');
    expect(stored?.revoked.length).toBeGreaterThan(0);
    const events = await published(s.store);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: BusinessEvents.USER_PERMISSIONS_CHANGED,
      aggregateType: 'User',
      aggregateId: 'u-1',
      payload: { reason: 'EDITED', before: { changes: { granted: [], revoked: [] } } },
    });
    const rendered = renderEventActivity(events[0] as never);
    expect(rendered.renderStatus).toBe('rendered');
  });

  it('only an Owner may edit', async () => {
    const s = setup(member('Staff'));
    for (const actor of ['Manager', 'Accountant', 'Staff', null] as const) {
      const r = await run(s, { granted: ['purchases.viewCosts'] }, actor);
      expect(!r.success && r.error.code).toBe('FORBIDDEN');
    }
    expect(s.changes.saves).toBe(0);
  });

  it('refuses the Owner and Attendant targets', async () => {
    for (const role of ['Owner', 'Attendant'] as const) {
      const s = setup(member(role));
      const r = await run(s, { granted: ['purchases.viewCosts'] });
      expect(!r.success && r.error.code).toBe('FORBIDDEN');
    }
  });

  it('refuses never-delegable grants and unknown ids', async () => {
    const s = setup(member('Manager'));
    const a = await run(s, { granted: ['organization.edit'] });
    expect(!a.success && a.error.code).toBe('VALIDATION_ERROR');
    const b = await run(s, { granted: ['nope.nothing'] });
    expect(!b.success && b.error.code).toBe('VALIDATION_ERROR');
    expect(s.changes.saves).toBe(0);
    expect(await published(s.store)).toEqual([]);
  });

  it('removes the row and emits when changes return to the defaults', async () => {
    const s = setup(member('Manager'));
    await run(s, { revoked: ['purchases.viewCosts'] });
    const r = await run(s, {});
    expect(r.success).toBe(true);
    expect(s.changes.rows.has('u-1')).toBe(false);
    expect(await published(s.store)).toHaveLength(2);
  });

  it('writes nothing for an unchanged request', async () => {
    const s = setup(member('Manager'));
    await run(s, {});
    expect(s.changes.saves).toBe(0);
    expect(await published(s.store)).toEqual([]);
  });

  it('is not found across organizations', async () => {
    const s = setup(member('Manager', 'org-2'));
    const r = await run(s, {});
    expect(!r.success && r.error.code).toBe('NOT_FOUND');
  });
});

describe('GetUserPermissions', () => {
  it('reports defaults, stored changes and the effective set', async () => {
    const s = setup(member('Manager'));
    s.changes.rows.set('u-1', { granted: [], revoked: ['purchases.viewCosts'] });
    const r = await new GetUserPermissions({
      users: s.users,
      changes: s.changes,
      access: s.access,
    }).execute({ userId: 'u-1' }, ctx());
    expect(r.success && r.data).toMatchObject({
      editable: true,
      entitled: true,
      changes: { revoked: ['purchases.viewCosts'] },
    });
    expect(r.success && r.data.effective).not.toContain('purchases.viewCosts');
  });

  it('shows stored changes as not applied when not entitled', async () => {
    const s = setup(member('Manager'), { entitled: false });
    s.changes.rows.set('u-1', { granted: [], revoked: ['purchases.viewCosts'] });
    const r = await new GetUserPermissions({
      users: s.users,
      changes: s.changes,
      access: s.access,
    }).execute({ userId: 'u-1' }, ctx());
    expect(r.success && r.data.entitled).toBe(false);
  });

  it('marks fixed Roles read-only', async () => {
    const s = setup(member('Attendant'));
    const r = await new GetUserPermissions({
      users: s.users,
      changes: s.changes,
      access: s.access,
    }).execute({ userId: 'u-1' }, ctx());
    expect(r.success && r.data).toMatchObject({ editable: false, readOnlyReason: 'ATTENDANT' });
  });
});

describe('Role change', () => {
  it('previews and then resets the changes in the same command', async () => {
    const s = setup(member('Manager'));
    s.changes.rows.set('u-1', { granted: [], revoked: ['purchases.viewCosts'] });

    const preview = await new PreviewUserRoleChange({ users: s.users, changes: s.changes }).execute(
      { userId: 'u-1', role: 'Accountant' },
      ctx(),
    );
    expect(preview.success && preview.data.droppedChanges).toEqual({
      granted: [],
      revoked: ['purchases.viewCosts'],
    });
    expect(s.changes.rows.has('u-1')).toBe(true);

    const r = await new UpdateUser({
      repository: s.users,
      events: s.events,
      permissionChanges: s.changes,
    }).execute({ id: 'u-1', role: 'Accountant' }, ctx());
    expect(r.success && r.data.droppedPermissionChanges).toEqual({
      granted: [],
      revoked: ['purchases.viewCosts'],
    });
    expect(s.changes.rows.has('u-1')).toBe(false);
    const events = (await published(s.store)) as Array<{ eventType: string; metadata: any }>;
    expect(events.map((e) => e.eventType)).toEqual([
      BusinessEvents.USER_UPDATED,
      BusinessEvents.USER_PERMISSIONS_CHANGED,
    ]);
    expect(events[1]!.metadata.grouping.role).toBe('related');
  });

  it('does not reset when the Role is unchanged', async () => {
    const s = setup(member('Manager'));
    s.changes.rows.set('u-1', { granted: [], revoked: ['purchases.viewCosts'] });
    const r = await new UpdateUser({
      repository: s.users,
      events: s.events,
      permissionChanges: s.changes,
    }).execute({ id: 'u-1', fullName: 'Ravi K', role: 'Manager' }, ctx());
    expect(r.success && r.data.droppedPermissionChanges).toBeNull();
    expect(s.changes.rows.has('u-1')).toBe(true);
  });
});
