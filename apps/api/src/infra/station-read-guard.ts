import type { Context } from 'hono';
import { isAuthorizedForStation, type Role } from '@pump/shared';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';

type Env = { Variables: { user: AuthenticatedPrincipal } };

/**
 * The checks every station-scoped read route runs before touching data:
 * the caller's Role may view the report, the request names a `stationId`, and
 * that station is one the caller may access.
 *
 * Returns the station id, or the error response to send back. Use it as
 *
 *   const scope = requireStationRead(c, canViewReports, 'Insufficient permissions to view Insights');
 *   if (scope instanceof Response) return scope;
 *
 * Nothing else is validated here: a route's own query parameters (a date
 * range, a range length) are its use case's to validate.
 */
export function requireStationRead<E extends Env>(
  c: Context<E>,
  roleAllowed: (role: Role) => boolean,
  forbiddenMessage: string,
): { stationId: string } | Response {
  const user = c.var.user;
  if (!roleAllowed(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: forbiddenMessage } }, 403);
  }
  const stationId = c.req.query('stationId');
  if (!stationId) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId' } },
      400,
    );
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }
  return { stationId };
}
