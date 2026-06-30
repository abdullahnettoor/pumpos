import { SystemClock, UuidGenerator } from '@pump/core';
import type { ExecutionContext } from '@pump/core';

export interface AuthedUser {
  id: string;
  organizationId: string;
}

export interface ContextOptions {
  stationId?: string | null;
  businessDayId?: string | null;
  correlationId?: string | null;
  timeZone?: string | null;
  businessDayStartsAt?: string | null;
}

/**
 * Build a core ExecutionContext from the authenticated request user. The clock
 * and id generator use real implementations here (deterministic doubles are
 * used in unit tests instead). Pass the station's timezone + day-start (see
 * loadStationClock) so business-date resolution is station-correct.
 */
export function buildContext(user: AuthedUser, opts: ContextOptions = {}): ExecutionContext {
  return {
    organizationId: user.organizationId,
    stationId: opts.stationId ?? null,
    businessDayId: opts.businessDayId ?? null,
    actorId: user.id,
    correlationId: opts.correlationId ?? null,
    timeZone: opts.timeZone ?? null,
    businessDayStartsAt: opts.businessDayStartsAt ?? null,
    clock: new SystemClock(),
    ids: new UuidGenerator(),
  };
}
