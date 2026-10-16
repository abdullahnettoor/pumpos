/**
 * Normalising an Owner's requested Permission changes (ADR 0013).
 *
 * The editor sends what it wants granted and revoked; storage keeps only the
 * differences from the Role's defaults, with prerequisites kept consistent:
 *  - granting a Permission also grants its missing prerequisites;
 *  - revoking a Permission also revokes everything that depends on it;
 *  - a Permission the Role holds anyway is not stored as a grant, and one the
 *    Role lacks is not stored as a revoke.
 * A never-delegable Permission can never be granted, not even as a
 * prerequisite of something else.
 */
import type { Role } from '../types/core.js';
import { defaultPermissionsFor, PERMISSIONS, type PermissionId } from './catalogue.js';
import { closePrerequisites, type PermissionChanges } from './effective.js';

export type PermissionChangeProblem =
  | { code: 'UNKNOWN_PERMISSION'; permission: string }
  | { code: 'NEVER_DELEGABLE'; permission: string }
  | { code: 'CONFLICTING_CHANGE'; permission: string };

export interface NormalizedPermissionChanges {
  /** Differences from the Role defaults, sorted, ready to store. */
  changes: { granted: PermissionId[]; revoked: PermissionId[] };
  /** The Permissions these changes resolve to. */
  effective: PermissionId[];
}

export type NormalizePermissionChangesResult =
  | { ok: true; value: NormalizedPermissionChanges }
  | { ok: false; problems: PermissionChangeProblem[] };

function isPermissionId(id: string): id is PermissionId {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, id);
}

const sorted = (ids: Iterable<PermissionId>): PermissionId[] => [...ids].sort();

/** An id and, transitively, every prerequisite it needs. Unknown ids give an empty list. */
export function withPrerequisites(id: string): PermissionId[] {
  const out = new Set<PermissionId>();
  const visit = (p: string) => {
    if (!isPermissionId(p) || out.has(p)) return;
    out.add(p);
    for (const pre of PERMISSIONS[p].prerequisites) visit(pre);
  };
  visit(id);
  return [...out];
}

/** True when both lists name the same ids. */
export function samePermissionChanges(
  a: PermissionChanges | null | undefined,
  b: PermissionChanges | null | undefined,
): boolean {
  const key = (c: PermissionChanges | null | undefined) =>
    JSON.stringify([[...(c?.granted ?? [])].sort(), [...(c?.revoked ?? [])].sort()]);
  return key(a) === key(b);
}

export function normalizePermissionChanges(
  role: Role,
  requested: PermissionChanges,
): NormalizePermissionChangesResult {
  const problems: PermissionChangeProblem[] = [];
  const defaults = new Set<PermissionId>(defaultPermissionsFor(role));
  const granted = new Set<PermissionId>();
  const revoked = new Set<PermissionId>();

  for (const raw of requested.granted ?? []) {
    if (!isPermissionId(raw)) problems.push({ code: 'UNKNOWN_PERMISSION', permission: raw });
    else granted.add(raw);
  }
  for (const raw of requested.revoked ?? []) {
    if (!isPermissionId(raw)) problems.push({ code: 'UNKNOWN_PERMISSION', permission: raw });
    else revoked.add(raw);
  }
  for (const id of granted) {
    if (revoked.has(id)) problems.push({ code: 'CONFLICTING_CHANGE', permission: id });
  }

  const effective = new Set(defaults);
  const addWithPrerequisites = (id: PermissionId, asked: boolean) => {
    if (effective.has(id)) return;
    if (PERMISSIONS[id].neverDelegable) {
      problems.push({ code: 'NEVER_DELEGABLE', permission: id });
      return;
    }
    effective.add(id);
    for (const p of PERMISSIONS[id].prerequisites) addWithPrerequisites(p, false);
    void asked;
  };
  for (const id of granted) if (!revoked.has(id)) addWithPrerequisites(id, true);
  for (const id of revoked) effective.delete(id);
  closePrerequisites(effective);

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      changes: {
        granted: sorted([...effective].filter((id) => !defaults.has(id))),
        revoked: sorted([...defaults].filter((id) => !effective.has(id))),
      },
      effective: sorted(effective),
    },
  };
}

/** What the Owner's editor shows for one member. */
export interface UserPermissionsView {
  userId: string;
  role: string;
  /** False for the Owner and Attendants, whose Permissions are fixed. */
  editable: boolean;
  readOnlyReason: 'OWNER' | 'ATTENDANT' | null;
  /** The Organization has "Custom permissions"; stored changes apply only then. */
  entitled: boolean;
  /** The Role's Default Permissions. */
  defaults: string[];
  /** Stored differences from the defaults. */
  changes: { granted: string[]; revoked: string[] };
  /** What the server enforces for this member right now. */
  effective: string[];
}

/** Changes a Role change would drop, listed so the UI can warn first. */
export interface RoleChangePreview {
  userId: string;
  fromRole: string;
  toRole: string;
  /** Null when the member has no stored changes (or the Role is unchanged). */
  droppedChanges: { granted: string[]; revoked: string[] } | null;
}
