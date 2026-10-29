import { IDEMPOTENCY_KEY_REUSED, isIdempotencyInProgress } from '@pump/shared';

/**
 * What the team sheets say when a write is refused or fails, and whether the
 * Idempotency-Key survives it. Pure.
 */

export type TeamAction = 'add' | 'update' | 'reset' | 'access' | 'status';

export interface TeamFailure {
  message: string;
  /**
   * The server may or may not have applied the write (network drop, 5xx, or an
   * attempt still in flight): the sheet says so and a retry reuses the key.
   */
  unknownOutcome: boolean;
  /** The server already holds an earlier attempt under this key with other content. */
  earlierAttemptReceived: boolean;
  /** The refusal shows the cached team list is out of date: refresh it. */
  listOutdated: boolean;
}

const codeOf = (e: unknown): string | undefined =>
  e && typeof e === 'object' ? (e as { code?: string }).code : undefined;
const reasonOf = (e: unknown): string | undefined => {
  const details = e && typeof e === 'object' ? (e as { details?: unknown }).details : undefined;
  return details && typeof details === 'object'
    ? (details as { reason?: string }).reason
    : undefined;
};
const statusOf = (e: unknown): number | undefined =>
  e && typeof e === 'object' ? (e as { status?: number }).status : undefined;

const VERB: Record<TeamAction, string> = {
  add: 'add this member',
  update: 'save these changes',
  reset: 'reset this password',
  access: 'give app access',
  status: 'change this member',
};

/** A decided answer is cached under the key by the API; only these leave it open. */
export function isOutcomeUnknown(error: unknown): boolean {
  const status = statusOf(error);
  if (status === undefined || status >= 500) return true;
  // The first attempt under this key is still running.
  return isIdempotencyInProgress(error);
}

/** Same key, different body: the earlier attempt reached the server (see `idempotency.ts`). */
export function isEarlierAttemptReceived(error: unknown): boolean {
  return codeOf(error) === IDEMPOTENCY_KEY_REUSED;
}

export function teamFailure(error: unknown, action: TeamAction): TeamFailure {
  const server = error instanceof Error && error.message ? error.message : null;
  const earlier = isEarlierAttemptReceived(error);
  const unknownOutcome = !earlier && isOutcomeUnknown(error);
  const fail = (message: string, listOutdated = false): TeamFailure => ({
    message,
    unknownOutcome,
    earlierAttemptReceived: earlier,
    listOutdated,
  });

  if (earlier)
    return fail(
      'An earlier attempt may already have gone through. The team list is refreshed: check it before trying again.',
    );

  // A 409 CONFLICT says why in `details.reason` (giving app access).
  switch (reasonOf(error)) {
    case 'ALREADY_HAS_LOGIN':
      return fail('This member already has a login. The team list is refreshed.', true);
    case 'IDENTITY_TAKEN':
      return fail(
        'That phone number or email already belongs to another login. Use a different one.',
      );
  }

  switch (codeOf(error)) {
    // Organization access: the server's wording says what to do about it.
    case 'SUBSCRIPTION_RESTRICTED':
    case 'ORGANIZATION_SUSPENDED':
      return fail(server ?? `Access is restricted, so you cannot ${VERB[action]} right now.`);
    case 'CAPABILITY_NOT_ENTITLED':
      return fail(server ?? 'Your plan does not include this.');
    case 'LIMIT_REACHED':
      return fail(
        server ??
          (action === 'access'
            ? 'Your plan has no room for another login. Contact PumpOS to add more.'
            : 'Your plan has no room for another member. Contact PumpOS to add more.'),
      );
    case 'FORBIDDEN':
      return fail(server ?? `You do not have permission to ${VERB[action]}.`);
    case 'NOT_FOUND':
      return fail('This member is no longer on the team.');
    case 'NO_LOGIN':
      return fail('This member has no login account to reset.');
    case 'CONFIG_ERROR':
      return fail('Sign-in accounts cannot be set up right now. Try again later.');
    case 'AUTH_PROVISION_FAILED':
    case 'AUTH_RESET_FAILED':
    case 'AUTH_BAN_FAILED':
    case 'BAD_REQUEST':
    case 'VALIDATION_ERROR':
      return fail(server ?? 'Check the details and try again.');
    default:
      return fail(server ?? `Could not ${VERB[action]}. Try again.`);
  }
}
