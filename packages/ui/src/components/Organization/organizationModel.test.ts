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
  stationCounts,
  stationFacts,
  stationPlanLine,
  loginPlanLine,
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

describe('stationPlanLine (#605)', () => {
  const plan = (used: number, value: number, reached = used >= value) => ({
    plan: 'CORE',
    limits: { station_count: { used, value, reached } },
  });

  it('is one line, only with the plan and only when the plan allows more than one station', () => {
    expect(stationPlanLine(plan(2, 3))).toBe('2 of 3 stations on your plan');
    expect(stationPlanLine(plan(1, 1))).toBeNull();
    expect(
      stationPlanLine({ limits: { station_count: { used: 1, value: 3, reached: false } } }),
    ).toBeNull();
    expect(stationPlanLine(undefined)).toBeNull();
  });

  it('says what to do at the limit', () => {
    expect(stationPlanLine(plan(3, 3))).toBe(
      '3 of 3 stations on your plan · Contact PumpOS to add another',
    );
  });

  // #603: the unlimited sentinel is never a number on screen.
  it('shows nothing for the unlimited sentinel', () => {
    expect(stationPlanLine(plan(1, UNLIMITED_LIMIT, false))).toBeNull();
  });
});

describe('stationFacts (#605)', () => {
  const settings = { timezone: 'Asia/Kolkata', business_day_starts_at: '05:30' };
  const value = (facts: ReturnType<typeof stationFacts>, label: string) =>
    facts.find((f) => f.label === label)?.value;

  it('counts the active tanks and dispensers, and reads the day on the station clock', () => {
    const facts = stationFacts({
      settings,
      tanks: [{}, { isActive: true }, { isActive: false }],
      dispensers: [{}, {}],
      openShift: { templateName: 'Morning', openedAt: '2026-10-15T00:30:00.000Z' },
    });
    expect(facts.map((f) => f.label)).toEqual([
      'Tanks',
      'Dispensers',
      'Timezone',
      'Day start',
      'Open shift',
    ]);
    expect(value(facts, 'Tanks')).toBe('2');
    expect(value(facts, 'Dispensers')).toBe('2');
    expect(value(facts, 'Timezone')).toBe('Asia/Kolkata');
    expect(value(facts, 'Day start')).toBe('5:30 am');
    expect(value(facts, 'Open shift')).toBe('Morning, since 6:00\u00a0am');
  });

  it('reads None without an open shift, and null while a list loads', () => {
    const facts = stationFacts({ settings, openShift: null });
    expect(value(facts, 'Open shift')).toBe('None');
    expect(value(facts, 'Tanks')).toBeNull();
    expect(value(facts, 'Dispensers')).toBeNull();
    expect(value(stationFacts({ settings }), 'Open shift')).toBeNull();
  });

  it('falls back to the default timezone and day start', () => {
    const facts = stationFacts({ settings: null, tanks: [], dispensers: [], openShift: null });
    expect(value(facts, 'Timezone')).toBe('Asia/Kolkata');
    expect(value(facts, 'Day start')).toBe('6:00 am');
    expect(value(facts, 'Tanks')).toBe('0');
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

describe('loginPlanLine (#648)', () => {
  const logins = (used: number, value: number, reached = used >= value) => ({
    plan: 'CORE',
    limits: { login_count: { used, value, reached } },
  });

  it('shows logins used against the limit', () => {
    expect(loginPlanLine(logins(4, 10))).toBe('4 of 10 logins');
  });

  it('says when the limit is reached', () => {
    expect(loginPlanLine(logins(3, 3))).toBe('3 of 3 logins · Contact PumpOS to add more');
  });

  it('never prints the unlimited sentinel as a number', () => {
    expect(loginPlanLine(logins(12, UNLIMITED_LIMIT, false))).toBe('12 logins · no limit');
  });

  it('shows nothing without a plan or a login limit', () => {
    expect(loginPlanLine(undefined)).toBeNull();
    expect(
      loginPlanLine({ limits: { login_count: { used: 1, value: 3, reached: false } } }),
    ).toBeNull();
    expect(loginPlanLine({ plan: 'CORE', limits: {} })).toBeNull();
  });
});
