import { describe, expect, it } from 'vitest';
import {
  assignableRoles,
  assignableStations,
  canActOn,
  canManageTeam,
  memberRights,
  teamWriteAccess,
  type TeamActor,
} from './permissions.js';

const manager: TeamActor = { role: 'Manager', userId: 'me', stationIds: ['s1'] };
const owner: TeamActor = { role: 'Owner', userId: 'me', stationIds: ['s1', 's2'] };

describe('who manages the team', () => {
  it('is the Owner and the Manager only', () => {
    expect(canManageTeam('Owner')).toBe(true);
    expect(canManageTeam('Manager')).toBe(true);
    expect(canManageTeam('Accountant')).toBe(false);
    expect(canManageTeam('Staff')).toBe(false);
    expect(canManageTeam('Attendant')).toBe(false);
  });
});

describe('assignableRoles', () => {
  it('offers an Owner every role', () => {
    expect(assignableRoles('Owner')).toEqual([
      'Owner',
      'Manager',
      'Accountant',
      'Staff',
      'Attendant',
    ]);
  });
  it('offers a Manager only Staff and Attendant', () => {
    expect(assignableRoles('Manager')).toEqual(['Staff', 'Attendant']);
  });
  it('offers nobody else anything', () => {
    for (const r of ['Accountant', 'Staff', 'Attendant'] as const)
      expect(assignableRoles(r)).toEqual([]);
  });
});

describe('assignableStations', () => {
  const stations = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
  it('gives an Owner every station', () => {
    expect(assignableStations(owner, stations)).toHaveLength(3);
  });
  it('gives a Manager only their own', () => {
    expect(assignableStations(manager, stations)).toEqual([{ id: 's1' }]);
  });
  it('gives others none', () => {
    expect(assignableStations({ role: 'Staff', stationIds: ['s1'] }, stations)).toEqual([]);
  });
});

describe('canActOn (the server rule)', () => {
  it('lets an Owner act on anyone', () => {
    expect(canActOn(owner, 'Owner', [])).toBe(true);
  });
  it('lets a Manager act on Staff / Attendant inside their stations', () => {
    expect(canActOn(manager, 'Staff', ['s1'])).toBe(true);
    expect(canActOn(manager, 'Attendant', ['s1'])).toBe(true);
  });
  it('refuses a Manager any other role', () => {
    for (const r of ['Owner', 'Manager', 'Accountant'] as const)
      expect(canActOn(manager, r, ['s1'])).toBe(false);
  });
  it('refuses a Manager a member on a station that is not theirs, or on none', () => {
    expect(canActOn(manager, 'Staff', ['s1', 's2'])).toBe(false);
    expect(canActOn(manager, 'Staff', ['s2'])).toBe(false);
    expect(canActOn(manager, 'Staff', [])).toBe(false);
  });
  it('refuses everyone else', () => {
    expect(canActOn({ role: 'Accountant', stationIds: ['s1'] }, 'Staff', ['s1'])).toBe(false);
  });
});

describe('memberRights', () => {
  const staff = { id: 'u1', role: 'Staff' as const, stationIds: ['s1'], hasLogin: true };

  it('lets a Manager manage a Staff member on their station', () => {
    expect(memberRights(manager, staff)).toEqual({
      canEdit: true,
      canResetPassword: true,
      canChangeStatus: true,
      roleLocked: false,
      reason: null,
    });
  });
  it('shows a Manager why an Accountant is out of reach', () => {
    const r = memberRights(manager, { ...staff, role: 'Accountant' });
    expect(r.canEdit).toBe(false);
    expect(r.canChangeStatus).toBe(false);
    expect(r.reason).toMatch(/Staff and Attendants on their own stations/);
  });
  it('shows a Manager why a member on another station is out of reach', () => {
    expect(memberRights(manager, { ...staff, stationIds: ['s1', 's2'] }).canEdit).toBe(false);
  });
  it('offers a password reset only to a member with a login', () => {
    expect(memberRights(owner, { ...staff, hasLogin: false }).canResetPassword).toBe(false);
  });
  it('keeps an Owner from deactivating, resetting or re-roling themselves', () => {
    const r = memberRights(owner, { id: 'me', role: 'Owner', stationIds: [], hasLogin: true });
    expect(r).toMatchObject({
      canEdit: true,
      canChangeStatus: false,
      canResetPassword: false,
      roleLocked: true,
    });
  });
  it('gives an Accountant nothing, and no message', () => {
    const r = memberRights({ role: 'Accountant', stationIds: ['s1'] }, staff);
    expect(r.canEdit).toBe(false);
    expect(r.reason).toBeNull();
  });
});

describe('teamWriteAccess', () => {
  it('is open in normal mode and while access is not known yet', () => {
    expect(teamWriteAccess('NORMAL').status).toBe('enabled');
    expect(teamWriteAccess(undefined).status).toBe('enabled');
  });
  it('is disabled with a reason under Restricted Access and Suspension', () => {
    const r = teamWriteAccess('RESTRICTED');
    expect(r.status === 'disabled' && r.reason).toMatch(/restricted/i);
    const s = teamWriteAccess('SUSPENDED');
    expect(s.status === 'disabled' && s.reason).toMatch(/suspended/i);
  });
});
