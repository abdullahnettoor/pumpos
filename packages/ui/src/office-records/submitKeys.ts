import { createIdempotencyKey } from '../query/handoverMutation.js';
import { keepsIdempotencyKey } from '../utils/idempotency.js';

/**
 * One Idempotency-Key per logical submit of an Office Record (#526).
 *
 * Within one open drawer the key is kept while the outcome of a save is
 * unknown (a network drop, a 5xx), even if the operator edits before saving
 * again: the API answers the same key with the first result, or refuses an
 * edited retry, so the record cannot land twice. A decided answer (saved, or a
 * 4xx) renews it.
 *
 * An unsettled key also outlives the drawer, but a new drawer picks it up only
 * for the same record (same kind, station and body). Closing after a network
 * drop and entering the same slip again cannot record it twice, and entering
 * a different record is not refused as an edited retry.
 */
export interface SubmitKeySession {
  /** The key to send with this body. */
  next(fingerprint: string): string;
  /** Record the outcome of the last send: no error means it was saved. */
  settle(error?: unknown): void;
}

export class OfficeSubmitKeys {
  private readonly pending = new Map<string, { key: string; fingerprint: string }>();

  constructor(private readonly newKey: () => string = createIdempotencyKey) {}

  session(scope: string): SubmitKeySession {
    let current: { key: string; fingerprint: string } | null = null;
    return {
      next: (fingerprint) => {
        if (!current) {
          const left = this.pending.get(scope);
          current =
            left && left.fingerprint === fingerprint ? left : { key: this.newKey(), fingerprint };
        }
        current = { key: current.key, fingerprint };
        return current.key;
      },
      settle: (error) => {
        if (!current) return;
        if (error !== undefined && keepsIdempotencyKey(error)) {
          this.pending.set(scope, current);
          return;
        }
        this.pending.delete(scope);
        current = null;
      },
    };
  }
}

/** The app-wide store of unsettled Office Record keys. */
export const officeSubmitKeys = new OfficeSubmitKeys();
