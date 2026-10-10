/**
 * Writing a saved member into the cached team list. The users list is static
 * tier, so a save repaints the cached rows at once and then invalidates the
 * key so the server's list wins (`screens/team/useTeamWrite.ts`).
 */
import type { TeamMember } from './members.js';

/** The fields of a saved member that belong on a list row (never the auth id). */
export function memberRow(saved: object | undefined): Partial<TeamMember> {
  if (!saved) return {};
  const from = saved as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const k of ['id', 'fullName', 'email', 'phone', 'role', 'status'])
    if (from[k] !== undefined) row[k] = from[k];
  return row;
}

/** Merge a patch into one member of the list. A list that is not there yet stays that way. */
export function patchMember<T extends { id: string }>(
  list: readonly T[] | undefined,
  id: string,
  patch: Partial<T>,
): T[] | undefined {
  if (!Array.isArray(list)) return list as undefined;
  return list.map((m) => (m.id === id ? { ...m, ...patch } : m));
}

/** Add a new member to the list unless it is already there (a replayed create). */
export function addMember<T extends { id: string }>(
  list: readonly T[] | undefined,
  member: T,
): T[] | undefined {
  if (!Array.isArray(list)) return list as undefined;
  return list.some((m) => m.id === member.id) ? [...list] : [...list, member];
}
