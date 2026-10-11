/**
 * Team members as the Team page shows them: who they are, where they work,
 * whether they are on the open shift. Pure; no React and no fetching.
 */
import type { Role } from '@pump/shared';

/** One row of `GET /setup/users` (the server drops the auth id and sends `hasLogin`). */
export interface TeamMember {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role: Role;
  /** `ACTIVE` or `INACTIVE`; older rows may omit it (treated as active). */
  status?: string;
  hasLogin?: boolean;
  stationIds?: string[];
}

export const ROLE_ORDER: readonly Role[] = ['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant'];

export const isInactive = (m: Pick<TeamMember, 'status'>): boolean => m.status === 'INACTIVE';

/** What someone signs in with: the email, else the phone number. */
export const loginIdentity = (m: Pick<TeamMember, 'email' | 'phone'>): string | null =>
  m.email?.trim() || m.phone?.trim() || null;

export type MemberStatusTone = 'good' | 'warn' | 'bad' | 'muted';

export interface MemberStatus {
  label: 'On shift' | 'Active' | 'No login' | 'Inactive';
  tone: MemberStatusTone;
}

/**
 * The one status a row shows. Inactive wins (they cannot sign in at all), then
 * on shift, then a member with no login (a record only), else Active.
 */
export function memberStatus(m: TeamMember, onShiftIds: ReadonlySet<string>): MemberStatus {
  if (isInactive(m)) return { label: 'Inactive', tone: 'bad' };
  if (onShiftIds.has(m.id)) return { label: 'On shift', tone: 'good' };
  if (!m.hasLogin) return { label: 'No login', tone: 'muted' };
  return { label: 'Active', tone: 'muted' };
}

/** Members still on the team: everyone not deactivated. */
export function activeMembers<T extends { status?: string }>(users: readonly T[] | undefined): T[] {
  return (users ?? []).filter((u) => !isInactive(u));
}

/** Distinct names of the people assigned to a Dispenser Unit on the open shift. */
export function onShiftNames(
  assignments: ReadonlyArray<{ userName?: string | null }> | undefined,
): string[] {
  const names = (assignments ?? []).map((a) => a.userName).filter((n): n is string => !!n);
  return [...new Set(names)];
}

/** Ids of the people assigned to a Dispenser Unit on the open shift. */
export function onShiftIds(
  assignments: ReadonlyArray<{ userId?: string | null }> | undefined,
): Set<string> {
  return new Set((assignments ?? []).map((a) => a.userId).filter((id): id is string => !!id));
}

/** Where a member works: Owners reach every station, others the ones assigned. */
export function stationSummary(
  m: Pick<TeamMember, 'role' | 'stationIds'>,
  stations: ReadonlyArray<{ id: string; name: string }>,
): string {
  if (m.role === 'Owner') return 'All stations';
  const names = (m.stationIds ?? [])
    .map((id) => stations.find((s) => s.id === id)?.name)
    .filter((n): n is string => !!n);
  // A Manager sees only their own stations, so a member's other stations are not
  // in the list: say how many are hidden rather than pretend they are not there.
  const hidden = (m.stationIds ?? []).length - names.length;
  if (names.length === 0 && hidden === 0) return 'No station';
  const shown = names.join(', ');
  if (hidden <= 0) return shown;
  const more = `${hidden} other station${hidden === 1 ? '' : 's'}`;
  return shown ? `${shown} + ${more}` : more;
}

/** Active members first, then by role (Owner → Attendant), then by name. */
export function sortMembers<T extends TeamMember>(members: readonly T[]): T[] {
  const rank = (r: Role) => {
    const i = ROLE_ORDER.indexOf(r);
    return i === -1 ? ROLE_ORDER.length : i;
  };
  return [...members].sort(
    (a, b) =>
      Number(isInactive(a)) - Number(isInactive(b)) ||
      rank(a.role) - rank(b.role) ||
      a.fullName.localeCompare(b.fullName),
  );
}
