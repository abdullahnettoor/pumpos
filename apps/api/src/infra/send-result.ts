import type { Result } from '@pump/core';

/**
 * The single place a domain error code becomes an HTTP status.
 *
 * It lives here rather than in each router because a code that is missing
 * from one copy silently degrades to 400 — which is exactly how
 * LIMIT_REACHED shipped as a 400 from the one route that raises it.
 *
 * HTTP status per stable domain error code. Access failures follow the same
 * contract: 403 for Role/Entitlement refusals, 409 for a reached Limit.
 */
export const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  // A broken domain invariant is a conflict with current state, not a
  // malformed request.
  INVARIANT_VIOLATION: 409,
  LIMIT_REACHED: 409,
  CAPABILITY_NOT_ENTITLED: 403,
};

/**
 * Render a use-case Result in the standard envelope:
 * `{ success: true, data }` or `{ success: false, error: { code, message } }`.
 */
export function sendResult<T>(c: any, result: Result<T>) {
  if (result.success) return c.json({ success: true, data: result.data });
  const status = STATUS_BY_CODE[result.error.code] ?? 400;
  return c.json({ success: false, error: result.error }, status);
}
