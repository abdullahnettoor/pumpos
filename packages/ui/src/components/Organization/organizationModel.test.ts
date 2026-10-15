import { describe, expect, it } from 'vitest';
import {
  buildStationRows,
  filterMembers,
  filterStations,
  groupActivityByDay,
  loginIdentity,
  memberCounts,
  memberState,
  memberStations,
  stationCapacity,
  stationCounts,
} from './organizationModel.js';

const stations = [
  {
    id: 's1',
    name: 'Kochi',
    address: 'NH 66',
    phone: '+91 98470',
    onboardingStatus: 'READY_FOR_OPERATIONS',
    settings: { fuel_brand: 'HPCL' },
  },
  { id: 's2', name: 'Thrissur', onboardingStatus: 'IN_PROGRESS' },
  { id: 's3', name: 'Kozhikode' },
];

describe('station rows', () => {
  const rows = buildStationRows(stations, 's2');

  it('reads each status, the detail line and the active station', () => {
    expect(rows.map((r) => r.state)).toEqual([
      'station-ready',
      'station-setup',
      'station-not-started',
    ]);
    expect(rows[0].details).toBe('NH 66 · +91 98470 · HPCL');
    expect(rows[2].details).toBe('');
    expect(rows.map((r) => r.active)).toEqual([false, true, false]);
  });

  it('counts and filters ready against still in setup', () => {
    expect(stationCounts(rows)).toEqual({ all: 3, ready: 1, setup: 2 });
    expect(filterStations(rows, 'ready').map((r) => r.station.id)).toEqual(['s1']);
    expect(filterStations(rows, 'setup').map((r) => r.station.id)).toEqual(['s2', 's3']);
    expect(filterStations(rows, 'all')).toHaveLength(3);
  });
});

describe('stationCapacity', () => {
  it('is shown only with the plan', () => {
    expect(
      stationCapacity({ limits: { station_count: { used: 1, value: 1, reached: true } } }),
    ).toBeNull();
    expect(stationCapacity(undefined)).toBeNull();
  });

  it('says what is left, or that the limit is reached', () => {
    expect(
      stationCapacity({
        plan: 'CORE',
        limits: { station_count: { used: 3, value: 5, reached: false } },
      }),
    ).toEqual({ used: 3, value: 5, reached: false, hint: '2 more on this plan' });
    expect(
      stationCapacity({
        plan: 'CORE',
        limits: { station_count: { used: 1, value: 1, reached: true } },
      })?.hint,
    ).toBe('Plan limit reached');
  });
});

describe('team', () => {
  const members = [
    {
      id: 'u1',
      fullName: 'Owner',
      email: 'o@x.in',
      role: 'Owner',
      status: 'ACTIVE',
      hasLogin: true,
    },
    {
      id: 'u2',
      fullName: 'Ravi',
      phone: '+9198',
      role: 'Manager',
      status: 'ACTIVE',
      hasLogin: true,
      stationIds: ['s1', 's2'],
    },
    {
      id: 'u3',
      fullName: 'Suresh',
      phone: '+9197',
      role: 'Attendant',
      status: 'INACTIVE',
      hasLogin: true,
      stationIds: ['gone'],
    },
    {
      id: 'u4',
      fullName: 'Anil',
      role: 'Staff',
      status: 'ACTIVE',
      hasLogin: false,
      stationIds: [],
    },
  ];

  it('gives each member one status, Inactive before No login', () => {
    expect(members.map(memberState)).toEqual(['active', 'active', 'inactive', 'no-login']);
    expect(memberState({ id: 'x', fullName: 'x', status: 'INACTIVE', hasLogin: false })).toBe(
      'inactive',
    );
  });

  it('names the login and the stations', () => {
    expect(loginIdentity(members[0])).toBe('o@x.in');
    expect(loginIdentity(members[1])).toBe('+9198');
    expect(loginIdentity(members[3])).toBeNull();
    expect(memberStations(members[0], stations)).toBe('All stations');
    expect(memberStations(members[1], stations)).toBe('Kochi, Thrissur');
    expect(memberStations(members[2], stations)).toBe('Unknown station');
    expect(memberStations(members[3], stations)).toBe('None');
  });

  it('counts and filters by status and search', () => {
    expect(memberCounts(members)).toEqual({ all: 4, active: 2, inactive: 1, 'no-login': 1 });
    expect(filterMembers(members, 'active', '').map((m) => m.id)).toEqual(['u1', 'u2']);
    expect(filterMembers(members, 'all', 'manager').map((m) => m.id)).toEqual(['u2']);
    expect(filterMembers(members, 'all', ' +9197 ').map((m) => m.id)).toEqual(['u3']);
  });
});

describe('groupActivityByDay', () => {
  const now = new Date(2026, 9, 15, 12, 0);
  const at = (d: number, h: number) => new Date(2026, 9, d, h, 0).toISOString();

  it('heads each day in words, keeping the feed order', () => {
    const items = [at(15, 9), at(15, 1), at(14, 20), at(13, 8)];
    const days = groupActivityByDay(items, (i) => i, now);
    expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Tue 13 Oct']);
    expect(days[0].items).toEqual([items[0], items[1]]);
    for (const d of days) expect(d.label).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('keeps an unreadable time apart', () => {
    expect(groupActivityByDay(['nope'], (i) => i, now)[0].label).toBe('Undated');
  });
});
