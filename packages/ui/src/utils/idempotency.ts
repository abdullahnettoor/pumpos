/**
 * When a write fails, must its next try carry the SAME Idempotency-Key?
 *
 * Yes while the outcome is unknown: no answer (network drop), a 5xx (the API
 * releases the key), or the API saying the first request with this key is still
 * running. Every other answer is decided (the API caches each 2xx/4xx under its
 * key), so the key is replaced and a retry is a new request.
 */
export function keepsIdempotencyKey(error: unknown): boolean {
  const e = error && typeof error === 'object' ? (error as { status?: number; code?: string }) : {};
  if (e.status === undefined || e.status >= 500) return true;
  return (
    e.code === 'CONFLICT' && error instanceof Error && /already in progress/i.test(error.message)
  );
}
