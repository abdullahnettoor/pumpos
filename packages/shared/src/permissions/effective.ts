/**
 * Effective Permissions (ADR 0013): Role defaults plus the user's stored
 * changes, then made safe. Pure: no I/O, so the server, the Owner's editor
 * (#553) and the apps resolve identically.
 *
 * Order:
 *  1. Role defaults.
 *  2. Apply stored changes (granted / revoked) ONLY when the Organization has
 *     the "Custom permissions" capability (`entitled`). Not entitled (a
 *     downgrade) => the changes are kept in storage but ignored here.
 *  3. Close prerequisites: a Permission missing a prerequisite is dropped,
 *     repeatedly, until stable.
 *  4. Fixed rules: the Owner and Attendants never take changes; a
 *     never-delegable Permission can be revoked from a Role that holds it by
 *     default but never granted to one that does not.
 *
 * Unknown ids in stored changes (removed from the catalogue) are ignored. A
 * Permission added to the catalogue later follows Role defaults for everyone
 * who has no change naming it.
 *
 * Granting does not auto-add prerequisites here: the editor adds them when it
 * writes, and a grant whose prerequisite is not held is dropped, so storage
 * can never widen access beyond what resolves.
 */
import type { Role } from '../types/core.js';
import { defaultPermissionsFor, PERMISSIONS, type PermissionId } from './catalogue.js';

export interface PermissionChanges {
  granted?: readonly string[] | null;
  revoked?: readonly string[] | null;
}

export interface ResolveEffectiveInput {
  role: Role | string | null | undefined;
  changes?: PermissionChanges | null;
  /** The Organization has the "Custom permissions" Product Capability. */
  entitled: boolean;
}

/** Roles whose Permissions are fixed: changes never apply. */
export function hasFixedPermissions(role: string | null | undefined): boolean {
  return role === 'Owner' || role === 'Attendant';
}

function isPermissionId(id: string): id is PermissionId {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, id);
}

/** Drop any Permission whose prerequisites are not all held, until stable. */
export function closePrerequisites(set: Set<PermissionId>): Set<PermissionId> {
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...set]) {
      if (PERMISSIONS[id].prerequisites.some((p) => !set.has(p))) {
        set.delete(id);
        changed = true;
      }
    }
  }
  return set;
}

export function resolveEffectivePermissions(input: ResolveEffectiveInput): Set<PermissionId> {
  const role = input.role;
  const base = new Set<PermissionId>(
    role ? defaultPermissionsFor(role as Role) : ([] as PermissionId[]),
  );
  if (!role || !input.entitled || hasFixedPermissions(role) || !input.changes) return base;

  for (const raw of input.changes.granted ?? []) {
    if (isPermissionId(raw) && !PERMISSIONS[raw].neverDelegable) base.add(raw);
  }
  for (const raw of input.changes.revoked ?? []) {
    if (isPermissionId(raw)) base.delete(raw);
  }
  return closePrerequisites(base);
}
