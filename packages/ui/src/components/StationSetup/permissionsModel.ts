import {
  normalizePermissionChanges,
  PERMISSION_IDS,
  PERMISSIONS,
  type PermissionId,
  type Role,
  withPrerequisites,
} from '@pump/shared';

/** The Permission changes as the editor holds them: differences from Role defaults. */
export interface Changes {
  granted: string[];
  revoked: string[];
}

export interface PermissionArea {
  area: string;
  ids: PermissionId[];
}

/** The catalogue grouped by area, in catalogue order. */
export function permissionAreas(): PermissionArea[] {
  const areas: PermissionArea[] = [];
  for (const id of PERMISSION_IDS) {
    const area = PERMISSIONS[id].area;
    const found = areas.find((a) => a.area === area);
    if (found) found.ids.push(id);
    else areas.push({ area, ids: [id] });
  }
  return areas;
}

export const labelOf = (id: string): string =>
  (PERMISSIONS as Record<string, { label: string }>)[id]?.label ?? id;

/** What the changes resolve to for the Role (the server's own normaliser). */
export function resolveDraft(role: string, changes: Changes): Set<string> {
  const result = normalizePermissionChanges(role as Role, changes);
  return new Set(result.ok ? result.value.effective : []);
}

/** The differences from Role defaults for a desired set. */
export function diffFromDefaults(role: string, desired: Set<string>, defaults: string[]): Changes {
  const base = new Set(defaults);
  return {
    granted: [...desired].filter((id) => !base.has(id)).sort(),
    revoked: [...base].filter((id) => !desired.has(id)).sort(),
  };
}

/** Flip one Permission; prerequisites and dependants follow (shared normaliser). */
export function togglePermission(
  role: string,
  desired: Set<string>,
  defaults: string[],
  id: string,
  on: boolean,
): Set<string> {
  const next = new Set(desired);
  // Turning a switch on restores what it needs, even a prerequisite revoked earlier.
  if (on) for (const p of withPrerequisites(id)) next.add(p);
  else next.delete(id);
  const normalised = normalizePermissionChanges(
    role as Role,
    diffFromDefaults(role, next, defaults),
  );
  return normalised.ok ? new Set(normalised.value.effective) : desired;
}

/** Prerequisites that flipping this switch on would also turn on. */
export function alsoTurnsOn(role: string, desired: Set<string>, defaults: string[], id: string) {
  if (desired.has(id)) return [];
  const after = togglePermission(role, desired, defaults, id, true);
  return [...after].filter((p) => p !== id && !desired.has(p));
}

/** Dependants that flipping this switch off would also turn off. */
export function alsoTurnsOff(role: string, desired: Set<string>, defaults: string[], id: string) {
  if (!desired.has(id)) return [];
  const after = togglePermission(role, desired, defaults, id, false);
  return [...desired].filter((p) => p !== id && !after.has(p));
}

export const isChanged = (id: string, changes: Changes): boolean =>
  changes.granted.includes(id) || changes.revoked.includes(id);

export const hasChanges = (c: Changes | null | undefined): boolean =>
  !!c && c.granted.length + c.revoked.length > 0;
