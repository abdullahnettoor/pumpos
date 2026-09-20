import type { CoreError, ResolutionCode } from '@pump/shared';

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
  /** A numeric Limit supplied by the Organization's Product Plan is used up. */
  LIMIT_REACHED: 'LIMIT_REACHED',
  /** The Organization has not been granted the Product Capability required. */
  CAPABILITY_NOT_ENTITLED: 'CAPABILITY_NOT_ENTITLED',
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

export function validationError(message: string, details?: Record<string, unknown>): CoreError {
  return { code: ErrorCodes.VALIDATION, message, details };
}

export function notFoundError(entity: string, id?: string): CoreError {
  return {
    code: ErrorCodes.NOT_FOUND,
    message: `${entity}${id ? ` (${id})` : ''} was not found`,
    details: id ? { entity, id } : { entity },
  };
}

export function conflictError(message: string, details?: Record<string, unknown>): CoreError {
  return { code: ErrorCodes.CONFLICT, message, details };
}

export function forbiddenError(
  message = 'Operation not permitted',
  details?: Record<string, unknown>,
): CoreError {
  return { code: ErrorCodes.FORBIDDEN, message, details };
}

/**
 * The Organization is not entitled to a Product Capability. Distinct from
 * FORBIDDEN, which is about the user's Role: this says the Organization has
 * not bought or been granted the capability at all. Maps to HTTP 403.
 */
export function capabilityNotEntitledError(
  message: string,
  details: { capability: string; resolution: ResolutionCode; actionLabel: string },
): CoreError {
  return { code: ErrorCodes.CAPABILITY_NOT_ENTITLED, message, details };
}

/**
 * A Limit is used up. Carries the structured detail the UI needs to explain
 * the next action instead of showing a generic error. Maps to HTTP 409.
 */
export function limitReachedError(
  message: string,
  details: {
    limit: string;
    value: number;
    used: number;
    resolution: ResolutionCode;
    actionLabel: string;
  },
): CoreError {
  return { code: ErrorCodes.LIMIT_REACHED, message, details };
}

export function invariantViolation(message: string, details?: Record<string, unknown>): CoreError {
  return { code: ErrorCodes.INVARIANT_VIOLATION, message, details };
}
