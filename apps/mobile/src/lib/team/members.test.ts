import { describe, expect, it } from 'vitest';
import {
  loginIdentity,
  memberStatus,
  onShiftIds,
  sortMembers,
  stationSummary,
  type TeamMember,
} from './members.js';

const m = (over: Partial<TeamMember>): TeamMember => ({
  id: 'u',
  fullName: 'A',
  role: 'Staff',
  hasLogin: true,
  stationIds: [],
  ...over,
});

describe('memberStatus', () => {
  const on = new Set(['u']);
  it('ranks Inactive over on shift over No login over Active', () => {
    expect(memberStatus(m({ status: 'INACTIVE' }), on).label).toBe('Inactive');
    expect(memberStatus(m({}), on).label).toBe('On shift');
    expect(memberStatus(m({ hasLogin: false }), new Set()).label).toBe('No login');
    expect(memberStatus(m({}), new Set()).label).toBe('Active');
  });
});

describe('onShiftIds', () => {
  it('collects user ids and tolerates no data', () => {
    expect([...onShiftIds([{ userId: 'a' }, { userId: 'a' }, { userId: null }, {}])]).toEqual([
      'a',
    ]);
    expect(onShiftIds(undefined).size).toBe(0);
  });
});

describe('stationSummary', () => {
  const stations = [
    { id: 's1', name: 'Kozhikode' },
    { id: 's2', name: 'Thrissur' },
  ];
  it('says an Owner reaches every station', () => {
    expect(stationSummary(m({ role: 'Owner' }), stations)).toBe('All stations');
  });
  it('names the assigned stations', () => {
    expect(stationSummary(m({ stationIds: ['s1', 's2'] }), stations)).toBe('Kozhikode, Thrissur');
  });
  it('counts stations the viewer cannot see', () => {
    expect(stationSummary(m({ stationIds: ['s1', 'zz'] }), stations)).toBe(
      'Kozhikode + 1 other station',
    );
    expect(stationSummary(m({ stationIds: ['zz', 'yy'] }), stations)).toBe('2 other stations');
  });
  it('says so when there is none', () => {
    expect(stationSummary(m({}), stations)).toBe('No station');
  });
});

describe('loginIdentity', () => {
  it('prefers the email, then the phone', () => {
    expect(loginIdentity({ email: 'a@b.co', phone: '+91' })).toBe('a@b.co');
    expect(loginIdentity({ email: null, phone: '+919876543210' })).toBe('+919876543210');
    expect(loginIdentity({})).toBeNull();
  });
});

describe('sortMembers', () => {
  it('puts the active first, then by role, then by name', () => {
    const list = [
      m({ id: '1', fullName: 'Zed', role: 'Attendant' }),
      m({ id: '2', fullName: 'Amy', role: 'Owner', status: 'INACTIVE' }),
      m({ id: '3', fullName: 'Bob', role: 'Staff' }),
      m({ id: '4', fullName: 'Cat', role: 'Owner' }),
    ];
    expect(sortMembers(list).map((x) => x.id)).toEqual(['4', '3', '1', '2']);
  });
});
