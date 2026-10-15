import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activityTimeZone,
  onboardGate,
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
import { UNLIMITED_LIMIT } from '@pump/shared';

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
    ).toEqual({
      used: 3,
      value: 5,
      reached: false,
      unlimited: false,
      label: '3 of 5',
      hint: '2 more on this plan',
    });
    expect(
      stationCapacity({
        plan: 'CORE',
        limits: { station_count: { used: 1, value: 1, reached: true } },
      })?.hint,
    ).toBe('This plan includes one Station. Contact PumpOS to add another.');
  });

  // #603: "1 of 1000000 · 999999 more" must never show.
  it('reads the unlimited sentinel as no limit', () => {
    const c = stationCapacity({
      plan: 'CORE',
      limits: { station_count: { used: 1, value: UNLIMITED_LIMIT, reached: false } },
    });
    expect(c).toMatchObject({ unlimited: true, reached: false, label: '1' });
    expect(c?.hint).toBe('No station limit on this plan');
    expect(`${c?.label} ${c?.hint}`).not.toMatch(/\d{4,}/);
  });
});

describe('onboardGate', () => {
  it('waits for the Access Document, then refuses only at the Limit', () => {
    expect(onboardGate(undefined).disabled).toBe(true);
    expect(
      onboardGate({ limits: { station_count: { used: 1, value: 3, reached: false } } }),
    ).toEqual({
      disabled: false,
    });
    // A Role without the plan still gets the Limit's answer.
    expect(
      onboardGate({ limits: { station_count: { used: 1, value: 1, reached: true } } }),
    ).toEqual({
      disabled: true,
      title: 'This plan includes one Station. Contact PumpOS to add another.',
    });
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
  // 15 Oct 2026, 12:00 IST.
  const now = new Date('2026-10-15T06:30:00Z');
  const tz = 'Asia/Kolkata';
  let original: string | undefined;
  beforeEach(() => {
    // A runner far from IST: a browser-local reading would put events on the wrong day.
    original = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
  });
  afterEach(() => {
    process.env.TZ = original;
  });

  it('heads each day in words by the station calendar, keeping the feed order', () => {
    const items = [
      '2026-10-15T03:30:00Z', // 09:00 IST, 15 Oct
      '2026-10-14T19:00:00Z', // 00:30 IST, 15 Oct (still 14 Oct in UTC and LA)
      '2026-10-14T18:00:00Z', // 23:30 IST, 14 Oct
      '2026-10-13T02:30:00Z', // 08:00 IST, 13 Oct
    ];
    const days = groupActivityByDay(items, (i) => i, { timeZone: tz, now });
    expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Tue 13 Oct']);
    expect(days[0].items).toEqual([items[0], items[1]]);
    expect(days[1].items).toEqual([items[2]]);
    for (const d of days) expect(d.label).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('puts an event just after the station midnight on the new day', () => {
    // 20:00 UTC on the 14th is 01:30 on the 15th in Kolkata.
    const days = groupActivityByDay(['2026-10-14T20:00:00Z'], (i) => i, { timeZone: tz, now });
    expect(days[0]).toMatchObject({ key: '2026-10-15', label: 'Today' });
  });

  it('reads in one explicit timezone: the station, else Asia/Kolkata', () => {
    expect(activityTimeZone({ settings: { timezone: 'Asia/Dubai' } })).toBe('Asia/Dubai');
    expect(activityTimeZone(null)).toBe('Asia/Kolkata');
    expect(activityTimeZone({ settings: {} })).toBe('Asia/Kolkata');
    // No station: 20:00 UTC on the 14th still groups on the IST day, not the runner's.
    const days = groupActivityByDay(['2026-10-14T20:00:00Z'], (i) => i, {
      timeZone: activityTimeZone(null),
      now,
    });
    expect(days[0].key).toBe('2026-10-15');
  });

  it('keeps an unreadable time apart', () => {
    expect(groupActivityByDay(['nope'], (i) => i, { timeZone: tz, now })[0].label).toBe('Undated');
  });
});
