import type { Result, CoreError } from '@pump/shared';

export type { Result, CoreError };

/** Build a successful Result. */
export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

/** Build a failed Result from a CoreError. */
export function err<T = never>(error: CoreError): Result<T> {
  return { success: false, error };
}

/** Build a failed Result from raw parts. */
export function fail<T = never>(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Result<T> {
  return { success: false, error: { code, message, details } };
}

export function isOk<T>(result: Result<T>): result is { success: true; data: T } {
  return result.success;
}

export function isErr<T>(result: Result<T>): result is { success: false; error: CoreError } {
  return !result.success;
}

/** Unwrap a Result, throwing if it failed. Intended for tests / trusted call sites. */
export function unwrap<T>(result: Result<T>): T {
  if (result.success) return result.data;
  throw new Error(
    `Attempted to unwrap a failed Result: ${result.error.code} - ${result.error.message}`,
  );
}
