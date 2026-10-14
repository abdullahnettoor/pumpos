import { createIdempotencyKey } from '../query/handoverMutation.js';
import { isIdempotencyKeyConflict, keepsIdempotencyKey } from '../utils/idempotency.js';

/**
 * One Idempotency-Key per logical submit of an Office Record (#526).
 *
 * Within one open drawer the key is kept while the outcome of a save is
 * unknown (a network drop, a 5xx), even if the operator edits before saving
 * again: the API answers the same key with the first result, or refuses an
 * edited retry, so the record cannot land twice. That refusal (a key conflict)
 * leaves the outcome unknown too, so the key is still kept. A decided answer
 * (saved, or any other 4xx) renews it.
 *
 * An unsettled key also outlives the drawer, but a new drawer picks it up only
 * for the same record (same kind, station and body) as one sent under it that
 * the server may hold. Closing after a network drop and entering the same slip
 * again cannot record it twice, and entering a different record is not refused
 * as an edited retry. A body the server refused under the key (a conflict) is
 * not what it holds, so a new drawer entering that body gets a fresh key.
 */
export interface SubmitKeySession {
  /** The key to send with this body. */
  next(fingerprint: string): string;
  /** Record the outcome of the last send: no error means it was saved. */
  settle(error?: unknown): void;
}

/** The save may or may not have landed: the next send must reuse the key. */
export const unknownOutcome = (error: unknown) =>
  keepsIdempotencyKey(error) || isIdempotencyKeyConflict(error);

/** A key whose outcome is unsettled, and the bodies sent under it the server may hold. */
interface HeldKey {
  key: string;
  held: string[];
}

export class OfficeSubmitKeys {
  private readonly pending = new Map<string, HeldKey>();

  constructor(private readonly newKey: () => string = createIdempotencyKey) {}

  session(scope: string): SubmitKeySession {
    let current: HeldKey | null = null;
    let sent = '';
    return {
      next: (fingerprint) => {
        if (!current) {
          const left = this.pending.get(scope);
          current = left?.held.includes(fingerprint) ? left : { key: this.newKey(), held: [] };
        }
        sent = fingerprint;
        return current.key;
      },
      settle: (error) => {
        if (!current) return;
        if (error !== undefined && unknownOutcome(error)) {
          // Within this drawer the key is kept either way; only the bodies a
          // new drawer may reuse it for change.
          current.held = isIdempotencyKeyConflict(error)
            ? current.held.filter((f) => f !== sent)
            : [...current.held.filter((f) => f !== sent), sent];
          if (current.held.length) this.pending.set(scope, current);
          else this.forget(scope, current.key);
          return;
        }
        this.forget(scope, current.key);
        current = null;
      },
    };
  }

  /** Drop the scope's unsettled key, unless another drawer has left a different one since. */
  private forget(scope: string, key: string) {
    if (this.pending.get(scope)?.key === key) this.pending.delete(scope);
  }
}

/** The app-wide store of unsettled Office Record keys. */
export const officeSubmitKeys = new OfficeSubmitKeys();
