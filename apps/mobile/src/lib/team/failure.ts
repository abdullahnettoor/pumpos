/**
 * What the team sheets say when a write is refused or fails, and whether the
 * Idempotency-Key survives it. Pure.
 */

export type TeamAction = 'add' | 'update' | 'reset' | 'status';

export interface TeamFailure {
  message: string;
  /**
   * The server may or may not have applied the write (network drop, 5xx, or an
   * attempt still in flight): the sheet says so and a retry reuses the key.
   */
  unknownOutcome: boolean;
  /** The server already holds an earlier attempt under this key with other content. */
  earlierAttemptReceived: boolean;
}

const codeOf = (e: unknown): string | undefined =>
  e && typeof e === 'object' ? (e as { code?: string }).code : undefined;
const statusOf = (e: unknown): number | undefined =>
  e && typeof e === 'object' ? (e as { status?: number }).status : undefined;

const VERB: Record<TeamAction, string> = {
  add: 'add this member',
  update: 'save these changes',
  reset: 'reset this password',
  status: 'change this member',
};

/** A decided answer is cached under the key by the API; only these leave it open. */
export function isOutcomeUnknown(error: unknown): boolean {
  const status = statusOf(error);
  if (status === undefined || status >= 500) return true;
  // 409 "already in progress": the first attempt is still running.
  return status === 409 && /in progress/i.test(error instanceof Error ? error.message : '');
}

/** Same key, different body: the earlier attempt reached the server (see `idempotency.ts`). */
export function isEarlierAttemptReceived(error: unknown): boolean {
  return (
    codeOf(error) === 'CONFLICT' &&
    /different request content/i.test(error instanceof Error ? error.message : '')
  );
}

export function teamFailure(error: unknown, action: TeamAction): TeamFailure {
  const server = error instanceof Error && error.message ? error.message : null;
  const earlier = isEarlierAttemptReceived(error);
  const unknownOutcome = !earlier && isOutcomeUnknown(error);
  const fail = (message: string): TeamFailure => ({
    message,
    unknownOutcome,
    earlierAttemptReceived: earlier,
  });

  if (earlier)
    return fail(
      'An earlier attempt may already have gone through. The team list is refreshed: check it before trying again.',
    );

  switch (codeOf(error)) {
    // Organization access: the server's wording says what to do about it.
    case 'SUBSCRIPTION_RESTRICTED':
    case 'ORGANIZATION_SUSPENDED':
      return fail(server ?? `Access is restricted, so you cannot ${VERB[action]} right now.`);
    case 'CAPABILITY_NOT_ENTITLED':
      return fail(server ?? 'Your plan does not include this.');
    case 'LIMIT_REACHED':
      return fail(
        server ?? 'Your plan has no room for another member. Contact PumpOS to add more.',
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
