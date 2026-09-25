import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { CreateUser, UpdateUser } from './index.js';
import type { User, UserRepository } from './index.js';

class UserRepo implements UserRepository {
  readonly rows = new Map<string, User>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async save(u: User) {
    this.rows.set(u.id, u);
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
