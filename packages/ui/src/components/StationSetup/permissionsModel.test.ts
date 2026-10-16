import { describe, expect, it } from 'vitest';
import { defaultPermissionsFor, PERMISSIONS } from '@pump/shared';
import {
  alsoTurnsOff,
  alsoTurnsOn,
  diffFromDefaults,
  resolveDraft,
  togglePermission,
} from './permissionsModel.js';

const role = 'Staff';
const defaults: string[] = [...defaultPermissionsFor(role)];
// A Permission with a prerequisite the Staff role does not hold, and one it holds with dependants.
const withPrereq = Object.entries(PERMISSIONS).find(
  ([id, d]) =>
    !defaults.includes(id) &&
    !d.neverDelegable &&
    d.prerequisites.some(
      (p) => !defaults.includes(p) && !PERMISSIONS[p as keyof typeof PERMISSIONS].neverDelegable,
    ),
)?.[0];

describe('permissionsModel', () => {
  it('turning off a held Permission lists nothing extra when nothing depends on it, and diff is empty at defaults', () => {
    const desired = new Set(defaults);
    expect(diffFromDefaults(role, desired, defaults)).toEqual({ granted: [], revoked: [] });
  });

  it('granting adds prerequisites and reports them as "also turns on"', () => {
    if (!withPrereq) return;
    const desired = new Set(defaults);
    const hint = alsoTurnsOn(role, desired, defaults, withPrereq);
    expect(hint.length).toBeGreaterThan(0);
    const after = togglePermission(role, desired, defaults, withPrereq, true);
    expect(after.has(withPrereq)).toBe(true);
    for (const p of hint) expect(after.has(p)).toBe(true);
  });

  it('revoking a prerequisite reports dependants as "also turns off"', () => {
    const dep = Object.entries(PERMISSIONS).find(
      ([id, d]) => defaults.includes(id) && d.prerequisites.length > 0,
    );
    expect(dep).toBeTruthy();
    const prereq = dep![1].prerequisites[0];
    const off = alsoTurnsOff(role, new Set(defaults), defaults, prereq);
    expect(off).toContain(dep![0]);
  });

  it('resolves stored changes for the role', () => {
    const first = defaults[defaults.length - 1];
    expect(resolveDraft(role, { granted: [], revoked: [first] }).has(first)).toBe(false);
  });
});
