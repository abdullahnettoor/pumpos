import { describe, expect, it } from 'vite-plus/test';
import { normalizePermissionChanges, samePermissionChanges, withPrerequisites } from './changes.js';
import { PERMISSIONS, defaultPermissionsFor, type PermissionId } from './catalogue.js';

const ids = Object.keys(PERMISSIONS) as PermissionId[];
const withPrereq = ids.find((id) => PERMISSIONS[id].prerequisites.length > 0)!;
const prereq = PERMISSIONS[withPrereq].prerequisites[0]!;
const neverDelegable = ids.find((id) => PERMISSIONS[id].neverDelegable)!;

describe('normalizePermissionChanges', () => {
  it('stores nothing for an empty request', () => {
    const r = normalizePermissionChanges('Staff', {});
    expect(r.ok && r.value.changes).toEqual({ granted: [], revoked: [] });
  });

  it('drops grants a Role already holds and revokes it lacks', () => {
    const held = [...defaultPermissionsFor('Staff')][0]!;
    const lacking = ids.find(
      (id) => !defaultPermissionsFor('Staff').has(id) && !PERMISSIONS[id].neverDelegable,
    )!;
    if (PERMISSIONS[lacking].neverDelegable) return;
    const r = normalizePermissionChanges('Staff', { granted: [held], revoked: [lacking] });
    expect(r.ok && r.value.changes).toEqual({ granted: [], revoked: [] });
  });

  it('adds missing prerequisites of a grant', () => {
    const role = (['Staff', 'Accountant', 'Manager'] as const).find(
      (r) =>
        !defaultPermissionsFor(r).has(withPrereq) &&
        !PERMISSIONS[withPrereq].neverDelegable &&
        !defaultPermissionsFor(r).has(prereq),
    );
    if (!role) return;
    const r = normalizePermissionChanges(role, { granted: [withPrereq] });
    expect(r.ok && r.value.changes.granted).toEqual(expect.arrayContaining([withPrereq, prereq]));
  });

  it('drops dependants of a revoked Permission', () => {
    const role = (['Manager', 'Accountant', 'Staff'] as const).find(
      (r) => defaultPermissionsFor(r).has(prereq) && defaultPermissionsFor(r).has(withPrereq),
    );
    expect(role).toBeDefined();
    const r = normalizePermissionChanges(role!, { revoked: [prereq] });
    expect(r.ok && r.value.changes.revoked).toEqual(expect.arrayContaining([prereq, withPrereq]));
    expect(r.ok && r.value.effective).not.toContain(withPrereq);
  });

  it('rejects never-delegable grants, unknown ids and conflicts', () => {
    const a = normalizePermissionChanges('Manager', { granted: [neverDelegable] });
    expect(a.ok).toBe(defaultPermissionsFor('Manager').has(neverDelegable));
    const b = normalizePermissionChanges('Staff', { granted: ['nope.nothing'] });
    expect(!b.ok && b.problems[0]).toMatchObject({ code: 'UNKNOWN_PERMISSION' });
    const c = normalizePermissionChanges('Staff', { granted: [withPrereq], revoked: [withPrereq] });
    expect(!c.ok && c.problems[0]).toMatchObject({ code: 'CONFLICTING_CHANGE' });
  });

  it('compares changes ignoring order', () => {
    expect(
      samePermissionChanges({ granted: ['a', 'b'] }, { granted: ['b', 'a'], revoked: [] }),
    ).toBe(true);
    expect(samePermissionChanges(null, { granted: ['a'] })).toBe(false);
  });
});

describe('withPrerequisites', () => {
  it('lists the id and its prerequisites, and nothing for an unknown id', () => {
    expect(withPrerequisites('expenses.void')).toEqual(
      expect.arrayContaining(['expenses.void', 'pages.expenses']),
    );
    expect(withPrerequisites('nope')).toEqual([]);
  });
});

describe('View costs gates supplier and purchase work', () => {
  const dependants: PermissionId[] = [
    'pages.suppliers',
    'suppliers.manage',
    'suppliers.archive',
    'purchases.record',
    'purchases.adjust',
    'accounts.manage',
  ];
  it('revoking viewCosts drops every dependant', () => {
    const r = normalizePermissionChanges('Manager', { revoked: ['purchases.viewCosts'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const id of dependants) expect(r.value.effective).not.toContain(id);
  });
  it('granting purchases.record on a Role lacking viewCosts adds it', () => {
    expect(PERMISSIONS['purchases.record'].prerequisites).toContain('purchases.viewCosts');
    expect(withPrerequisites('purchases.record')).toContain('purchases.viewCosts');
  });
  it('defaults are unchanged: holders of a dependant hold viewCosts', () => {
    for (const role of ['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant'] as const) {
      const d = defaultPermissionsFor(role);
      if (dependants.some((id) => d.has(id))) expect(d.has('purchases.viewCosts')).toBe(true);
    }
  });
});
