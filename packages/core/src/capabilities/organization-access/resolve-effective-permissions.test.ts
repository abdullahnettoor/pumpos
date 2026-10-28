import { describe, expect, it } from 'vite-plus/test';
import { resolveEffectivePermissions, defaultPermissionsFor, PERMISSIONS } from '@pump/shared';
import type { PermissionId } from '@pump/shared';
import { resolveUserPermissions } from './resolve-effective-permissions.js';
import type { OrganizationAccessInputs } from './ports.js';

const r = (role: string, changes: { granted?: string[]; revoked?: string[] }, entitled = true) =>
  resolveEffectivePermissions({ role, changes, entitled });

describe('resolveEffectivePermissions', () => {
  it('returns Role defaults without changes', () => {
    expect(r('Accountant', {})).toEqual(defaultPermissionsFor('Accountant'));
  });

  it('applies grants and revokes on top of defaults', () => {
    const set = r('Accountant', { granted: ['pages.inventory'], revoked: ['reports.export'] });
    expect(set.has('pages.inventory')).toBe(true);
    expect(set.has('reports.export')).toBe(false);
  });

  it('ignores changes when not entitled (downgrade keeps but ignores)', () => {
    const changes = { granted: ['pages.inventory'], revoked: ['reports.export'] };
    expect(r('Accountant', changes, false)).toEqual(defaultPermissionsFor('Accountant'));
    expect(r('Accountant', changes, true)).not.toEqual(defaultPermissionsFor('Accountant'));
  });

  it('drops a Permission whose prerequisite was revoked, transitively', () => {
    const set = r('Manager', { revoked: ['pages.station'] });
    expect(set.has('station.manage')).toBe(false);
    expect(set.has('station.onboard')).toBe(false);
  });

  it('drops a grant whose prerequisite is not held', () => {
    const noReports = r('Staff', { granted: ['reports.attendant'] });
    expect(noReports.has('reports.attendant')).toBe(false);
    const withReports = r('Staff', {
      granted: ['pages.reports', 'reports.view', 'reports.attendant'],
    });
    expect(withReports.has('reports.attendant')).toBe(true);
  });

  it('never grants a never-delegable Permission, but may revoke it from a holder', () => {
    expect(
      r('Accountant', { granted: ['organization.edit', 'team.manage'] }).has('team.manage'),
    ).toBe(false);
    expect(r('Accountant', { granted: ['organization.edit'] }).has('organization.edit')).toBe(
      false,
    );
    expect(r('Manager', { revoked: ['team.manage'] }).has('team.manage')).toBe(false);
  });

  it('never changes the Owner or an Attendant', () => {
    expect(r('Owner', { revoked: ['pages.dashboard'] })).toEqual(defaultPermissionsFor('Owner'));
    expect(r('Attendant', { granted: ['pages.inventory'] })).toEqual(
      defaultPermissionsFor('Attendant'),
    );
  });

  it('ignores unknown ids', () => {
    const set = r('Staff', { granted: ['nope.nothing'], revoked: ['gone.forever'] });
    expect(set).toEqual(defaultPermissionsFor('Staff'));
  });

  it('a new catalogue Permission follows defaults for users who have not changed it', () => {
    // A change naming one id leaves every other id at its Role default.
    const set = r('Manager', { revoked: ['reports.export'] });
    const others = (Object.keys(PERMISSIONS) as PermissionId[]).filter(
      (id) => id !== 'reports.export',
    );
    for (const id of others) {
      if (PERMISSIONS[id].prerequisites.includes('reports.export' as PermissionId)) continue;
      expect(set.has(id)).toBe(defaultPermissionsFor('Manager').has(id));
    }
  });

  it('unknown role resolves to nothing', () => {
    expect(resolveEffectivePermissions({ role: 'Ghost', entitled: true }).size).toBe(0);
  });
});

describe('resolveUserPermissions', () => {
  const inputs = (granted: string[]): OrganizationAccessInputs => ({
    plan: 'CORE',
    subscriptionStatus: 'ACTIVE',
    accessUntil: null,
    grantedCapabilities: granted,
    limitOverrides: {},
    usage: { station_count: 0 },
  });
  const deps = (granted: string[], reads = { n: 0 }) => ({
    access: { load: async () => (reads.n++, inputs(granted)) },
    changes: { load: async () => ({ granted: ['pages.reports'], revoked: [] }) },
  });
  const who = { organizationId: 'o', userId: 'u', role: 'Staff' };

  it('applies changes when the Organization has the capability', async () => {
    const set = await resolveUserPermissions(deps(['permissions.custom']), who);
    expect(set.has('pages.reports')).toBe(true);
  });

  it('ignores changes without the capability', async () => {
    const set = await resolveUserPermissions(deps([]), who);
    expect(set.has('pages.reports')).toBe(false);
  });

  it('does not read access for the Owner', async () => {
    const reads = { n: 0 };
    await resolveUserPermissions(deps(['permissions.custom'], reads), { ...who, role: 'Owner' });
    expect(reads.n).toBe(0);
  });
});
