import { describe, it, expect } from 'vite-plus/test';
import {
  isAuthorizedForStation,
  isHandoverSelfScoped,
  canActOnTeamMember,
  canWriteStationSetup,
  UserContext,
  ResourceContext,
} from './guards.js';
import { can, principalOf } from './catalogue.js';
import type { Role } from '../types/core.js';

describe('Role and Shift Permissions Guards', () => {
  describe('isAuthorizedForStation', () => {
    it('should allow Owners to access any station', () => {
      const owner: UserContext = { role: 'Owner', assignedStationIds: [] };
      const resource: ResourceContext = { organizationId: 'org-1', stationId: 'station-A' };
      expect(isAuthorizedForStation(owner, resource)).toBe(true);
    });

    it('should allow Staff to access their assigned station', () => {
      const staff: UserContext = { role: 'Staff', assignedStationIds: ['station-A'] };
      const resource: ResourceContext = { organizationId: 'org-1', stationId: 'station-A' };
      expect(isAuthorizedForStation(staff, resource)).toBe(true);
    });

    it('should deny Staff from accessing unassigned stations', () => {
      const staff: UserContext = { role: 'Staff', assignedStationIds: ['station-A'] };
      const resource: ResourceContext = { organizationId: 'org-1', stationId: 'station-B' };
      expect(isAuthorizedForStation(staff, resource)).toBe(false);
    });
  });

  describe('Shift Lifecycle Guards', () => {
    it('should allow Owners, Managers, and Staff to open shifts', () => {
      expect(can(principalOf('Owner'), 'shifts.open')).toBe(true);
      expect(can(principalOf('Manager'), 'shifts.open')).toBe(true);
      expect(can(principalOf('Staff'), 'shifts.open')).toBe(true);
      expect(can(principalOf('Accountant'), 'shifts.open')).toBe(false);
    });

    it('should restrict reopening shifts to Owners and Managers only', () => {
      expect(can(principalOf('Owner'), 'shifts.reopen')).toBe(true);
      expect(can(principalOf('Manager'), 'shifts.reopen')).toBe(true);
      expect(can(principalOf('Staff'), 'shifts.reopen')).toBe(false);
      expect(can(principalOf('Accountant'), 'shifts.reopen')).toBe(false);
    });

    it('shares close / reopen business day between Owner and Manager (#551)', () => {
      const holders = ROLES.filter((r) => can(principalOf(r), 'shifts.closeDay'));
      expect(holders).toEqual(['Owner', 'Manager']);
    });
  });
});

const ROLES: Role[] = ['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant'];
const holders = (perm: Parameters<typeof can>[1]) => ROLES.filter((r) => can(principalOf(r), perm));

describe('Default Permissions that guarded a behaviour before the catalogue', () => {
  it.each([
    ['pricing.change', ['Owner', 'Manager']],
    ['station.onboard', ['Owner', 'Manager']],
    ['station.reportTemplates', ['Owner', 'Manager']],
    ['station.tankLevels', ['Owner', 'Manager']],
    ['inventory.density', ['Owner', 'Manager', 'Accountant', 'Staff']],
    ['inventory.decantation', ['Owner', 'Manager', 'Accountant']],
    ['purchases.record', ['Owner', 'Manager', 'Accountant']],
    ['expenses.create', ['Owner', 'Manager', 'Accountant', 'Staff']],
    ['expenses.void', ['Owner', 'Manager']],
    ['handover.record', ROLES],
    ['mobile.home', ['Owner', 'Manager']],
    ['mobile.shifts', ['Owner', 'Manager']],
    ['mobile.insights', ['Owner', 'Manager']],
  ] as const)('%s', (perm, expected) => {
    expect(holders(perm)).toEqual(expected);
  });
});

// #301: Attendants and Accountants hand over only their own Drawer.
describe('handover whose-data rule', () => {
  it.each([
    ['Attendant', true],
    ['Accountant', true],
    ['Owner', false],
    ['Manager', false],
    ['Staff', false],
  ] as const)('self-scopes a %s: %s', (role, selfScoped) => {
    expect(isHandoverSelfScoped(role)).toBe(selfScoped);
  });
});

describe('canActOnTeamMember', () => {
  const manager = { role: 'Manager' as Role, stationIds: ['A'] };
  it('lets an Owner act on anyone', () => {
    expect(canActOnTeamMember({ role: 'Owner', stationIds: [] }, 'Manager', [])).toBe(true);
  });
  it('limits a Manager to Staff and Attendants on every shared station', () => {
    expect(canActOnTeamMember(manager, 'Staff', ['A'])).toBe(true);
    expect(canActOnTeamMember(manager, 'Staff', ['A', 'B'])).toBe(false);
    expect(canActOnTeamMember(manager, 'Staff', [])).toBe(false);
    expect(canActOnTeamMember(manager, 'Accountant', ['A'])).toBe(false);
    expect(canActOnTeamMember({ role: 'Staff', stationIds: ['A'] }, 'Staff', ['A'])).toBe(false);
  });
});

describe('canWriteStationSetup', () => {
  it('reaches every station for an Owner, assigned ones for a Manager, none for others', () => {
    const user = (role: Role, ids: string[]) => ({ role, assignedStationIds: ids });
    expect(canWriteStationSetup(user('Owner', []), 'X')).toBe(true);
    expect(canWriteStationSetup(user('Manager', ['X']), 'X')).toBe(true);
    expect(canWriteStationSetup(user('Manager', ['X']), 'Y')).toBe(false);
    expect(canWriteStationSetup(user('Manager', ['X']), null)).toBe(false);
    expect(canWriteStationSetup(user('Accountant', ['X']), 'X')).toBe(false);
  });
});
