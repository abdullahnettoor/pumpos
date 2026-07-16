import type { CoreError } from '@pump/shared';

/**
 * Canonical domain error codes. Adapters map these to transport-specific
 * responses (e.g. HTTP status codes) at the boundary.
 */
export const ErrorCodes = {
  VALIDATION: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVARIANT_VIOLATION: 'INVARIANT_VIOLATION',
  INTERNAL: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export function coreError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): CoreError {
  return { code, message, details };
}

export function validationError(
  message: string,
  details?: Record<string, unknown>,
): CoreError {
  return { code: ErrorCodes.VALIDATION, message, details };
}

export function notFoundError(entity: string, id?: string): CoreError {
  return {
    code: ErrorCodes.NOT_FOUND,
    message: `${entity}${id ? ` (${id})` : ''} was not found`,
    details: id ? { entity, id } : { entity },
  };
}

export function conflictError(
  message: string,
  details?: Record<string, unknown>,
): CoreError {
  return { code: ErrorCodes.CONFLICT, message, details };
}

export function forbiddenError(
  message = 'Operation not permitted',
  details?: Record<string, unknown>,
): CoreError {
  return { code: ErrorCodes.FORBIDDEN, message, details };
}

export function invariantViolation(
  message: string,
  details?: Record<string, unknown>,
): CoreError {
  return { code: ErrorCodes.INVARIANT_VIOLATION, message, details };
}
