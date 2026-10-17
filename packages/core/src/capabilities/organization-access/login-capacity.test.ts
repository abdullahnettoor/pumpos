import { describe, expect, it } from 'vitest';
import { UNLIMITED_LIMIT } from '@pump/shared';
import { ensureLoginCapacity, type LoginCapacityPort } from './login-capacity.js';
import { buildAccessDocument } from './resolve-access.js';
import type { OrganizationAccessInputs } from './ports.js';

const inputs = (over: Partial<OrganizationAccessInputs> = {}): OrganizationAccessInputs => ({
  plan: 'CORE',
  subscriptionStatus: 'ACTIVE',
  accessUntil: null,
  grantedCapabilities: [],
  limitOverrides: {},
  usage: { station_count: 1, login_count: 0 },
  ...over,
});

const port = (i: OrganizationAccessInputs): LoginCapacityPort & { locked: number } => {
  const p = {
    locked: 0,
    lockOrganization: async () => {
      p.locked += 1;
    },
    load: async () => i,
  };
  return p;
};

const usage = (logins: number) => ({ station_count: 1, login_count: logins });

describe('login_count Limit (#648)', () => {
  it.each([
    ['CORE', 3],
    ['PRO', 10],
  ])('%s allows %i logins and refuses the next', async (plan, limit) => {
    const below = port(inputs({ plan, usage: usage(limit - 1) }));
    const ok = await ensureLoginCapacity(below, 'org');
    expect(ok.success).toBe(true);
    expect(below.locked).toBe(1);

    const refused = await ensureLoginCapacity(port(inputs({ plan, usage: usage(limit) })), 'org');
    expect(refused.success).toBe(false);
    if (refused.success) return;
    expect(refused.error.code).toBe('LIMIT_REACHED');
    expect(refused.error.message).toMatch(/login limit is reached/);
    expect(refused.error.details).toMatchObject({ limit: 'login_count', value: limit, used: limit });
  });

  it('PRO_PLUS is unlimited', async () => {
    const r = await ensureLoginCapacity(port(inputs({ plan: 'PRO_PLUS', usage: usage(500) })), 'o');
    expect(r.success).toBe(true);
  });

  it('a platform override raises the limit for that Organization', async () => {
    const i = inputs({ usage: usage(3), limitOverrides: { login_count: 5 } });
    expect((await ensureLoginCapacity(port(i), 'o')).success).toBe(true);
    expect(
      (await ensureLoginCapacity(port({ ...i, usage: usage(5) }), 'o')).success,
    ).toBe(false);
  });

  it('a demo Organization (limit lifted) is never refused', async () => {
    const i = inputs({ usage: usage(50), limitOverrides: { login_count: UNLIMITED_LIMIT } });
    expect((await ensureLoginCapacity(port(i), 'o')).success).toBe(true);
  });

  it('after a downgrade the document reports over-limit usage and refuses only new logins', async () => {
    const i = inputs({ plan: 'CORE', usage: usage(7) });
    const doc = buildAccessDocument({ inputs: i, role: 'Owner' });
    expect(doc.limits.login_count).toEqual({ value: 3, used: 7, reached: true });
    expect((await ensureLoginCapacity(port(i), 'o')).success).toBe(false);
  });

  it('the Access Document shows logins used against the limit per plan', () => {
    const d = (plan: string, used: number) =>
      buildAccessDocument({ inputs: inputs({ plan, usage: usage(used) }), role: 'Owner' }).limits
        .login_count;
    expect(d('CORE', 2)).toEqual({ value: 3, used: 2, reached: false });
    expect(d('PRO', 10)).toEqual({ value: 10, used: 10, reached: true });
    expect(d('PRO_PLUS', 40)).toEqual({ value: UNLIMITED_LIMIT, used: 40, reached: false });
  });
});
