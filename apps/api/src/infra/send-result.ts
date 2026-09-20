import type { Result } from '@pump/core';

/**
 * HTTP status per stable domain error code. Access failures follow the same
 * contract: 403 for Role/Entitlement refusals, 409 for a reached Limit.
 */
export const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  LIMIT_REACHED: 409,
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
