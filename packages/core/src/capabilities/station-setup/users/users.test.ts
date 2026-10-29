import { describe, expect, it } from 'vite-plus/test';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { coreError, err, ok } from '../../../kernel/index.js';
import type { Result } from '../../../kernel/index.js';
import type { OrganizationAccessInputs } from '../../organization-access/ports.js';
import { CreateUser, GrantUserAppAccess, UpdateUser } from './index.js';
import type { LoginProvisioner, User, UserRepository } from './index.js';

class UserRepo implements UserRepository {
  readonly rows = new Map<string, User>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async save(u: User) {
    this.rows.set(u.id, u);
  }
  async linkLogin(id: string, authUserId: string) {
    const row = this.rows.get(id);
    if (row && row.authUserId === null) this.rows.set(id, { ...row, authUserId });
  }
  async setStationAssignments() {}
  async listWithAssignments() {
    return [];
  }
}

const ctx = (): ExecutionContext => ({
  organizationId: 'org-1',
  stationId: null,
  businessDayId: null,
  actorId: 'owner-1',
  correlationId: null,
  clock: new FixedClock(new Date('2026-01-01T00:00:00.000Z')),
  ids: new SequentialIdGenerator('user'),
});
const deps = (repository: UserRepo) => ({
  repository,
  events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
});

// #300: phone numbers are Indian mobiles, stored as +91XXXXXXXXXX.
describe('CreateUser phone', () => {
  it.each(['98765 43210', '+91 9876543210', '09876543210'])(
    'stores %s as +919876543210',
    async (phone) => {
      const r = await new CreateUser(deps(new UserRepo())).execute(
        { fullName: 'Ravi', phone },
        ctx(),
      );
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.phone).toBe('+919876543210');
    },
  );

  it('rejects an invalid mobile', async () => {
    const repo = new UserRepo();
    const r = await new CreateUser(deps(repo)).execute({ fullName: 'Ravi', phone: '12345' }, ctx());
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('VALIDATION_ERROR');
    expect(repo.rows.size).toBe(0);
  });

  it('stores no phone for a blank one', async () => {
    const r = await new CreateUser(deps(new UserRepo())).execute(
      { fullName: 'Ravi', phone: '' },
      ctx(),
    );
    expect(r.success && r.data.phone).toBeNull();
  });
});

describe('UpdateUser phone', () => {
  const existing = async () => {
    const repo = new UserRepo();
    await repo.save({
      id: 'u-1',
      organizationId: 'org-1',
      authUserId: null,
      fullName: 'Ravi',
      email: null,
      phone: '+919876543210',
      role: 'Staff',
      status: 'ACTIVE',
      createdAt: '',
      updatedAt: '',
    });
    return repo;
  };

  it('normalizes a changed phone', async () => {
    const r = await new UpdateUser(deps(await existing())).execute(
      { id: 'u-1', phone: '0 91234 56789' },
      ctx(),
    );
    expect(r.success && r.data.phone).toBe('+919123456789');
  });

  it('rejects an invalid phone', async () => {
    const r = await new UpdateUser(deps(await existing())).execute(
      { id: 'u-1', phone: '555' },
      ctx(),
    );
    expect(r.success).toBe(false);
  });

  it('keeps the phone when none is sent', async () => {
    const r = await new UpdateUser(deps(await existing())).execute(
      { id: 'u-1', fullName: 'Ravi K' },
      ctx(),
    );
    expect(r.success && r.data.phone).toBe('+919876543210');
  });
});

describe('GrantUserAppAccess (#462)', () => {
  const member = (over: Partial<User> = {}): User => ({
    id: 'u-1',
    organizationId: 'org-1',
    authUserId: null,
    fullName: 'Ravi',
    email: null,
    phone: null,
    role: 'Staff',
    status: 'ACTIVE',
    createdAt: '',
    updatedAt: '',
    ...over,
  });

  const setup = async (
    opts: {
      user?: Partial<User>;
      logins?: number;
      provision?: (input: { email: string; password: string }) => Result<{ authUserId: string }>;
    } = {},
  ) => {
    const repo = new UserRepo();
    await repo.save(member(opts.user));
    const store = new InMemoryEventStore();
    const calls: Array<{ email: string; password: string }> = [];
    const order: string[] = [];
    const logins: LoginProvisioner = {
      createLogin: async (input) => {
        order.push('create');
        calls.push(input);
        return opts.provision ? opts.provision(input) : ok({ authUserId: 'auth-new' });
      },
    };
    const inputs: OrganizationAccessInputs = {
      plan: 'CORE',
      subscriptionStatus: 'ACTIVE',
      accessUntil: null,
      grantedCapabilities: [],
      limitOverrides: {},
      usage: { station_count: 1, login_count: opts.logins ?? 0 },
    };
    const capacity = {
      lockOrganization: async () => {
        order.push('lock');
      },
      load: async () => inputs,
    };
    const useCase = new GrantUserAppAccess({
      repository: repo,
      events: new InProcessEventDispatcher({ store }),
      capacity,
      logins,
    });
    return { repo, store, calls, order, useCase };
  };

  it('creates a login for an email identity, links it and records the email', async () => {
    const { repo, calls, useCase } = await setup();
    const r = await useCase.execute(
      { id: 'u-1', email: ' Ravi@Example.com ', password: 'correct-horse' },
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(calls).toEqual([{ email: 'ravi@example.com', password: 'correct-horse' }]);
    expect(repo.rows.get('u-1')).toMatchObject({
      authUserId: 'auth-new',
      email: 'ravi@example.com',
    });
  });

  it('derives the login handle from a phone identity and stores the normalized phone', async () => {
    const { repo, calls, useCase } = await setup();
    const r = await useCase.execute(
      { id: 'u-1', phone: '98765 43210', password: 'correct-horse' },
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(calls[0]?.email).toBe('919876543210@users.pumpos.app');
    expect(repo.rows.get('u-1')).toMatchObject({ authUserId: 'auth-new', phone: '+919876543210' });
  });

  it('emits USER_APP_ACCESS_GRANTED without the password', async () => {
    const { store, useCase } = await setup();
    await useCase.execute({ id: 'u-1', email: 'r@example.com', password: 'correct-horse' }, ctx());

    const events = store.events;
    expect(events.map((e) => e.eventType)).toEqual(['USER_APP_ACCESS_GRANTED']);
    expect(events[0]).toMatchObject({ aggregateType: 'User', aggregateId: 'u-1' });
    expect(JSON.stringify(events)).not.toContain('correct-horse');
  });

  it('refuses a member who already has a login, creating nothing', async () => {
    const { calls, useCase } = await setup({ user: { authUserId: 'auth-old' } });
    const r = await useCase.execute(
      { id: 'u-1', email: 'r@example.com', password: 'p'.repeat(8) },
      ctx(),
    );
    expect(!r.success && r.error).toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'ALREADY_HAS_LOGIN' },
    });
    expect(calls).toEqual([]);
  });

  it('refuses a member of another Organization as not found', async () => {
    const { calls, useCase } = await setup({ user: { organizationId: 'org-2' } });
    const r = await useCase.execute(
      { id: 'u-1', email: 'r@example.com', password: 'p'.repeat(8) },
      ctx(),
    );
    expect(!r.success && r.error.code).toBe('NOT_FOUND');
    expect(calls).toEqual([]);
  });

  it('refuses at the login limit, before creating any login', async () => {
    const { calls, useCase } = await setup({ logins: 3 });
    const r = await useCase.execute(
      { id: 'u-1', email: 'r@example.com', password: 'p'.repeat(8) },
      ctx(),
    );
    expect(!r.success && r.error.code).toBe('LIMIT_REACHED');
    expect(calls).toEqual([]);
  });

  it('takes no seat for an INACTIVE member (reactivation takes it)', async () => {
    const { repo, useCase } = await setup({ logins: 3, user: { status: 'INACTIVE' } });
    const r = await useCase.execute(
      { id: 'u-1', email: 'r@example.com', password: 'p'.repeat(8) },
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(repo.rows.get('u-1')?.authUserId).toBe('auth-new');
  });

  it('locks the Organization before it creates the login', async () => {
    const { order, useCase } = await setup();
    await useCase.execute({ id: 'u-1', email: 'r@example.com', password: 'p'.repeat(8) }, ctx());
    expect(order[0]).toBe('lock');
    expect(order.indexOf('create')).toBeGreaterThan(order.lastIndexOf('lock'));
  });

  it('reports a taken identity as a conflict and links nothing', async () => {
    const { repo, store, useCase } = await setup({
      provision: () => err(coreError('CONFLICT', 'taken', { reason: 'IDENTITY_TAKEN' })),
    });
    const r = await useCase.execute(
      { id: 'u-1', email: 'r@example.com', password: 'p'.repeat(8) },
      ctx(),
    );
    expect(!r.success && r.error.details).toMatchObject({ reason: 'IDENTITY_TAKEN' });
    expect(repo.rows.get('u-1')?.authUserId).toBeNull();
    expect(store.events).toEqual([]);
  });

  it.each([
    ['no identity', { password: 'p'.repeat(8) }],
    ['both identities', { email: 'r@example.com', phone: '9876543210', password: 'p'.repeat(8) }],
    ['a short password', { email: 'r@example.com', password: 'short' }],
    ['an invalid phone', { phone: '555', password: 'p'.repeat(8) }],
  ])('rejects %s', async (_name, body) => {
    const { calls, useCase } = await setup();
    const r = await useCase.execute({ id: 'u-1', ...body }, ctx());
    expect(!r.success && r.error.code).toBe('VALIDATION_ERROR');
    expect(calls).toEqual([]);
  });
});
