import { describe, expect, it } from 'vite-plus/test';
import { withAppAccessGranted } from './teamMembers.js';

describe('withAppAccessGranted (#462)', () => {
  const list = [
    {
      id: 'u-1',
      fullName: 'Ravi',
      email: null,
      phone: null,
      role: 'Staff',
      hasLogin: false,
      stationIds: ['s1'],
    },
    { id: 'u-2', fullName: 'Meera', email: 'm@x.in', phone: null, role: 'Staff', hasLogin: true },
  ];

  it('marks that member as having a login and saves the identity it was given', () => {
    const next = withAppAccessGranted(list, { id: 'u-1', phone: '+919876543210' });
    expect(next[0]).toEqual({ ...list[0], phone: '+919876543210', hasLogin: true });
    expect(next[1]).toBe(list[1]);
  });

  it('keeps a contact detail the answer does not carry', () => {
    const next = withAppAccessGranted(list, { id: 'u-1', email: 'r@x.in' });
    expect(next[0]).toMatchObject({ email: 'r@x.in', phone: null, stationIds: ['s1'] });
  });

  it('returns the same list when the member is not cached', () => {
    expect(withAppAccessGranted(list, { id: 'u-9', email: 'a@b.in' })).toBe(list);
  });

  it('returns the same list when the member already reads as the answer says', () => {
    expect(withAppAccessGranted(list, { id: 'u-2', email: 'm@x.in', phone: null })).toBe(list);
  });
});
