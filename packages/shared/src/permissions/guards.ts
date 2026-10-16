/**
 * The fixed checks that are NOT Permissions (ADR 0013): station access, and the
 * whose-data rules. Everything a user "may do" is a Permission in
 * `catalogue.ts`, asked through `can(principal, permission)`.
 */
import { Role } from '../types/core.js';
import { can, type Principal } from './catalogue.js';

export interface UserContext {
  role: Role;
  assignedStationIds: string[];
}

export interface ResourceContext {
  organizationId: string;
  stationId?: string | null;
}

/**
 * Owners are not scoped to assigned stations: they reach every station of the
 * Organization. Station access is a fixed rule, separate from Permissions.
 */
export function hasOrganizationWideStationAccess(user: { role?: string | null }): boolean {
  return user.role === 'Owner';
}

/**
 * Checks if the user belongs to the same organization and is assigned to the station.
 * Owners bypass station-level scoping.
 */
export function isAuthorizedForStation(user: UserContext, resource: ResourceContext): boolean {
  if (hasOrganizationWideStationAccess(user)) {
    return true;
  }
  if (!resource.stationId) {
    return false;
  }
  return user.assignedStationIds.includes(resource.stationId);
}

/**
 * May the user write station setup at this station: they hold `station.manage`
 * and reach the station (Owners everywhere, others at assigned stations only).
 */
export function canWriteStationSetup(
  user: UserContext & Principal,
  stationId?: string | null,
): boolean {
  if (!can(user, 'station.manage')) return false;
  if (hasOrganizationWideStationAccess(user)) return true;
  return !!stationId && user.assignedStationIds.includes(stationId);
}

/** True for the mobile-only, self-scoped Attendant role (Attendant-app rule). */
export function isAttendant(role: Role | null | undefined): boolean {
  return role === 'Attendant';
}

/** Roles whose handover writes are limited to their own Drawer (#301). Whose-data rule. */
export function isHandoverSelfScoped(role: Role): boolean {
  return role === 'Attendant' || role === 'Accountant';
}

/** Roles a Manager (not Owner) is allowed to create/act on. Whose-data rule. */
export function isManageableByManager(targetRole: Role): boolean {
  return targetRole === 'Staff' || targetRole === 'Attendant';
}

/** Whose-data rule: may this actor give a team member this Role? Owners any; Managers Staff/Attendant. */
export function canAssignTeamRole(actorRole: Role, targetRole: Role): boolean {
  if (hasOrganizationWideStationAccess({ role: actorRole })) return true;
  return actorRole === 'Manager' && isManageableByManager(targetRole);
}

/** Whose-data rule: may this actor assign a member to this station? Owners any; Managers their own. */
export function canAssignStation(
  actor: { role: Role; stationIds: readonly string[] },
  stationId: string,
): boolean {
  if (hasOrganizationWideStationAccess(actor)) return true;
  return actor.role === 'Manager' && actor.stationIds.includes(stationId);
}

/**
 * Whose-data rule for team management: an Owner acts on anyone; a Manager only
 * on Staff and Attendants, and only when assigned to EVERY station the target
 * touches (a target with no station scope is not implicitly manageable).
 */
export function canActOnTeamMember(
  actor: { role: Role; stationIds: readonly string[] },
  targetRole: Role,
  targetStationIds: readonly string[] = [],
): boolean {
  if (hasOrganizationWideStationAccess(actor)) return true;
  if (actor.role !== 'Manager') return false;
  if (!isManageableByManager(targetRole)) return false;
  if (targetStationIds.length === 0) return false;
  return targetStationIds.every((s) => actor.stationIds.includes(s));
}
