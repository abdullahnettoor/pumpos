/**
 * Who may manage whom, decided exactly as the server does it.
 *
 * The rules come from `@pump/shared` guards (`canManageStaff`,
 * `isManageableByManager`) and from `canActOnTarget` in the API's
 * `station-setup` route: an Owner manages every Role; a Manager manages only
 * Staff and Attendants, and only when the member's stations are ALL among the
 * Manager's own (a member with no station is out of a Manager's reach). The
 * server re-checks every write; this decides what the pickers and buttons offer.
 */
import { canManageStaff, isManageableByManager, type AccessMode, type Role } from '@pump/shared';
import { ROLE_ORDER, type TeamMember } from './members.js';

export interface TeamActor {
  role: Role;
  /** The signed-in user's own member id, when known (they cannot lock themselves out). */
  userId?: string | null;
  /** Stations the actor may assign: every station for an Owner, their own for a Manager. */
  stationIds: readonly string[];
}

/** May this Role add or manage members at all? Owner and Manager. */
export const canManageTeam = (role: Role): boolean => canManageStaff(role);

/** The Roles this actor may give: all five for an Owner, Staff and Attendant for a Manager. */
export function assignableRoles(role: Role): Role[] {
  if (role === 'Owner') return [...ROLE_ORDER];
  if (role === 'Manager') return ROLE_ORDER.filter(isManageableByManager);
  return [];
}

/** The stations this actor may assign. */
export function assignableStations<S extends { id: string }>(
  actor: Pick<TeamActor, 'role' | 'stationIds'>,
  stations: readonly S[],
): S[] {
  if (actor.role === 'Owner') return [...stations];
  if (actor.role === 'Manager') return stations.filter((s) => actor.stationIds.includes(s.id));
  return [];
}

/** Whether the actor may act on a target with this Role and these stations (the server's `canActOnTarget`). */
export function canActOn(
  actor: Pick<TeamActor, 'role' | 'stationIds'>,
  targetRole: Role,
  targetStationIds: readonly string[],
): boolean {
  if (actor.role === 'Owner') return true;
  if (actor.role !== 'Manager') return false;
  if (!isManageableByManager(targetRole)) return false;
  if (targetStationIds.length === 0) return false;
  return targetStationIds.every((id) => actor.stationIds.includes(id));
}

export const MANAGER_SCOPE_NOTE =
  'Managers can manage only Staff and Attendants on their own stations.';

export interface MemberRights {
  canEdit: boolean;
  canResetPassword: boolean;
  canChangeStatus: boolean;
  /** The member is the signed-in user: their Role stays as it is. */
  roleLocked: boolean;
  /** Why the actor cannot manage this member, when the reason is worth showing. */
  reason: string | null;
}

const NONE: MemberRights = {
  canEdit: false,
  canResetPassword: false,
  canChangeStatus: false,
  roleLocked: false,
  reason: null,
};

/** What this actor may do to one member. */
export function memberRights(
  actor: TeamActor,
  member: Pick<TeamMember, 'id' | 'role' | 'stationIds' | 'hasLogin'>,
): MemberRights {
  if (!canManageTeam(actor.role)) return NONE;
  if (!canActOn(actor, member.role, member.stationIds ?? []))
    return { ...NONE, reason: MANAGER_SCOPE_NOTE };
  const self = !!actor.userId && actor.userId === member.id;
  return {
    canEdit: true,
    // Resetting your own password here or switching off your own login would
    // strand you: those go through sign-in and another Owner.
    canResetPassword: !!member.hasLogin && !self,
    canChangeStatus: !self,
    roleLocked: self,
    reason: null,
  };
}

export type TeamWriteAccess = { status: 'enabled' } | { status: 'disabled'; reason: string };

/**
 * Every team write (`POST|PUT /setup/users...`) is BLOCKED under Restricted
 * Access and Suspension, so the actions are disabled with the reason. An Access
 * Document that has not loaded is not a refusal: the server decides and its
 * answer is shown on the sheet.
 */
export function teamWriteAccess(accessMode: AccessMode | undefined): TeamWriteAccess {
  if (accessMode === 'SUSPENDED')
    return {
      status: 'disabled',
      reason: 'Team changes are paused while this organization is suspended.',
    };
  if (accessMode === 'RESTRICTED')
    return {
      status: 'disabled',
      reason: 'Team changes are not available while access is restricted.',
    };
  return { status: 'enabled' };
}
