import { isAccessPolicyError } from '@pump/shared';

/**
 * Was this failure a refusal — the user's Role (403 / FORBIDDEN) or the
 * Organization's access (`isAccessPolicyError`: CAPABILITY_NOT_ENTITLED,
 * LIMIT_REACHED, SUBSCRIPTION_RESTRICTED, ORGANIZATION_SUSPENDED)? Retrying
 * cannot change the answer, so a refusal shows its message and no Retry.
 */
export function isAccessRefusal(error: unknown): boolean {
  if (isAccessPolicyError(error)) return true;
  const e = error as { status?: unknown; code?: unknown } | null | undefined;
  return e?.status === 403 || e?.code === 'FORBIDDEN';
}
