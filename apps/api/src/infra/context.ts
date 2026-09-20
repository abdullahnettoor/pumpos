import { SystemClock, UuidGenerator } from '@pump/core';
import type { ExecutionContext } from '@pump/core';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';
import type { ActivityActorSnapshot, ActivityGroupingRole } from './activity.js';

export type AuthedUser = AuthenticatedPrincipal;

export interface ContextOptions {
  stationId?: string | null;
  businessDayId?: string | null;
  correlationId?: string | null;
  groupingRole?: ActivityGroupingRole;
  timeZone?: string | null;
  businessDayStartsAt?: string | null;
}

export interface CommandTrace {
  correlationId: string;
}

export function createCommandTrace(): CommandTrace {
  return { correlationId: new UuidGenerator().newId() };
}

/**
 * Extra context consumed by the in-flight event-activity core contract.
 * Keeping this intersection local allows older core builds to remain usable.
 */
export interface ActivityExecutionContext extends ExecutionContext {
  actorSnapshot: ActivityActorSnapshot;
  groupingRole: ActivityGroupingRole;
}

/**
 * Build a core ExecutionContext from the authenticated request user. The clock
 * and id generator use real implementations here (deterministic doubles are
 * used in unit tests instead). Pass the station's timezone + day-start (see
 * loadStationClock) so business-date resolution is station-correct.
 */
export function buildContext(
  user: AuthedUser,
  opts: ContextOptions = {},
): ActivityExecutionContext {
  const ids = new UuidGenerator();
  return {
    organizationId: user.organizationId,
    stationId: opts.stationId ?? null,
    businessDayId: opts.businessDayId ?? null,
    actorId: user.id,
    correlationId: opts.correlationId ?? ids.newId(),
    actorSnapshot: {
      kind: 'tenant_user',
      displayName: user.fullName || user.email || 'Unknown user',
      role: user.role,
      subjectId: user.id,
    },
    groupingRole: opts.groupingRole ?? 'primary',
    timeZone: opts.timeZone ?? null,
    businessDayStartsAt: opts.businessDayStartsAt ?? null,
    clock: new SystemClock(),
    ids,
  };
}

/** Identity of the PumpOS platform administrator acting on an Organization. */
export interface PlatformAdminPrincipal {
  email: string;
  subjectId: string | null;
}

/**
 * Build an ExecutionContext for a platform command acting on one Organization.
 *
 * `actorId` stays null: a platform administrator is not a tenant User, so the
 * actor lives in the snapshot (and on the row) as an email + auth subject.
 */
export function buildPlatformContext(
  admin: PlatformAdminPrincipal,
  organizationId: string,
): ActivityExecutionContext {
  const ids = new UuidGenerator();
  return {
    organizationId,
    stationId: null,
    businessDayId: null,
    actorId: null,
    correlationId: ids.newId(),
    actorSnapshot: {
      kind: 'platform_admin',
      displayName: admin.email,
      role: 'Platform Admin',
      subjectId: admin.subjectId,
    },
    groupingRole: 'primary',
    timeZone: null,
    businessDayStartsAt: null,
    clock: new SystemClock(),
    ids,
  };
}
