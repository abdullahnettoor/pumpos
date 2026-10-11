import { createIdempotencyKey } from '../query/handoverMutation.js';

/** The Idempotency-Key of one save form, tied to the request body it first carried. */
export interface SaveKey {
  key: string;
  fingerprint: string | null;
}

export const newSaveKey = (): SaveKey => ({ key: createIdempotencyKey(), fingerprint: null });

/**
 * Key for the next send of `body`. A key kept after an unknown-outcome failure
 * is only valid for the SAME request: when the form changed since, the body no
 * longer matches what the server may have stored under it, so it is renewed.
 */
export function keyForBody(state: SaveKey, body: unknown): string {
  const fingerprint = JSON.stringify(body);
  if (state.fingerprint !== null && state.fingerprint !== fingerprint)
    state.key = createIdempotencyKey();
  state.fingerprint = fingerprint;
  return state.key;
}

/** After the server answered (or the outcome is decided): the next save is a new request. */
export function resetSaveKey(state: SaveKey): void {
  state.key = createIdempotencyKey();
  state.fingerprint = null;
}
