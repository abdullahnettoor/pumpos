/**
 * Error code (409) the API returns when an Idempotency-Key is sent again with a
 * different body: an earlier request under that key reached the server, and the
 * changed one is refused (`apps/api/src/infra/idempotency.ts`).
 */
export const IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED';
