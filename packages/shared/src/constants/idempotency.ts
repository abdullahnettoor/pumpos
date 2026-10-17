/**
 * Error code (409) the API returns when an Idempotency-Key is sent again with a
 * different body: an earlier request under that key reached the server, and the
 * changed one is refused (`apps/api/src/infra/idempotency.ts`).
 */
export const IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED';

/**
 * The API's answer (409) when a request arrives while the first one under the
 * same Idempotency-Key is still running: its outcome is unknown, so a retry must
 * keep the key. It rides in `error.details.reason`; `error.code` stays
 * `CONFLICT` because released desktop builds (stock count) keep their key on a
 * CONFLICT, and would mint a new one on any other code. Once no released
 * client reads CONFLICT for it, the API may move it to `error.code`: both are read.
 */
export const IDEMPOTENCY_IN_PROGRESS = 'IDEMPOTENCY_IN_PROGRESS';

const IN_PROGRESS_MESSAGE = /already in progress/i;

/** Is this API failure the in-progress answer above? */
export function isIdempotencyInProgress(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; details?: unknown; message?: unknown };
  const reason =
    e.details && typeof e.details === 'object'
      ? (e.details as { reason?: unknown }).reason
      : undefined;
  if (reason === IDEMPOTENCY_IN_PROGRESS || e.code === IDEMPOTENCY_IN_PROGRESS) return true;
  // An API deployed before the reason existed says so only in the message.
  // Accepted for one release, while clients can still meet that API; drop after.
  return (
    e.code === 'CONFLICT' && typeof e.message === 'string' && IN_PROGRESS_MESSAGE.test(e.message)
  );
}
