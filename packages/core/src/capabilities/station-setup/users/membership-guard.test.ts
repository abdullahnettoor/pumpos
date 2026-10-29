import { describe, expect, it } from 'vite-plus/test';
import type { Role } from '@pump/shared';
import { checkMembershipChange, checkSelfPasswordReset } from './membership-guard.js';

const owner: { id: string; role: Role; status: string } = {
  id: 'u2',
  role: 'Owner',
  status: 'ACTIVE',
};
const base = { actorUserId: 'u1', target: owner, otherActiveOwners: 1 };
const code = (r: any) => (r.success ? null : r.error.code);

describe('checkMembershipChange (#443)', () => {
  it('refuses self-deactivation', () => {
    const r = checkMembershipChange({ ...base, actorUserId: 'u2', status: 'INACTIVE' });
    expect(code(r)).toBe('FORBIDDEN');
  });
  it('refuses self-demotion but allows an unchanged role', () => {
    expect(code(checkMembershipChange({ ...base, actorUserId: 'u2', role: 'Manager' }))).toBe(
      'FORBIDDEN',
    );
    expect(checkMembershipChange({ ...base, actorUserId: 'u2', role: 'Owner' }).success).toBe(true);
  });
  it('refuses removing the last active Owner, by anyone', () => {
    const solo = { ...base, otherActiveOwners: 0 };
    expect(code(checkMembershipChange({ ...solo, status: 'INACTIVE' }))).toBe('CONFLICT');
    expect(code(checkMembershipChange({ ...solo, role: 'Manager' }))).toBe('CONFLICT');
  });
  it('allows it when another active Owner remains', () => {
    expect(checkMembershipChange({ ...base, status: 'INACTIVE' }).success).toBe(true);
    expect(checkMembershipChange({ ...base, role: 'Manager' }).success).toBe(true);
  });
  it('leaves other members and reactivation alone', () => {
    const mgr = { ...owner, id: 'u3', role: 'Manager' as const };
    const none = { actorUserId: 'u1', otherActiveOwners: 0 };
    expect(checkMembershipChange({ ...none, target: mgr, status: 'INACTIVE' }).success).toBe(true);
    expect(
      checkMembershipChange({ ...none, target: { ...owner, status: 'INACTIVE' }, status: 'ACTIVE' })
        .success,
    ).toBe(true);
  });
});

describe('checkSelfPasswordReset', () => {
  it('refuses only the own account', () => {
    expect(code(checkSelfPasswordReset('u1', 'u1'))).toBe('FORBIDDEN');
    expect(checkSelfPasswordReset('u1', 'u2').success).toBe(true);
  });
});
