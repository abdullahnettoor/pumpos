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
 *
 * Every unsettled key in a scope is kept, not just the latest (#564): another
 * record left unanswered after this one, or a second drawer of the same kind
 * open at once, must not make this record's key forgettable. A key is let go
 * only when its own drawer gets a decided answer, or when no body the server
 * may hold is left under it.
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

/**
 * A soft bound on the unsettled keys kept per scope, so a long session of
 * dropped saves cannot grow the store without end. Past it the oldest is let go:
 * re-entering that record would get a fresh key. Reaching it takes this many
 * unanswered saves of one kind at one station in one app session, by which time
 * the operator is reading the list again, not re-entering old slips.
 */
export const MAX_HELD_KEYS_PER_SCOPE = 20;

/** A key whose outcome is unsettled, and the bodies sent under it the server may hold. */
interface HeldKey {
  key: string;
  held: string[];
}

export class OfficeSubmitKeys {
  /** Per scope, every unsettled key, oldest first. */
  private readonly pending = new Map<string, HeldKey[]>();

  constructor(private readonly newKey: () => string = createIdempotencyKey) {}

  session(scope: string): SubmitKeySession {
    let current: HeldKey | null = null;
    let sent = '';
    return {
      next: (fingerprint) => {
        current ??= this.heldFor(scope, fingerprint) ?? { key: this.newKey(), held: [] };
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
          if (current.held.length) this.hold(scope, current);
          else this.release(scope, current);
          return;
        }
        this.release(scope, current);
        current = null;
      },
    };
  }

  /** The oldest unsettled key in the scope the server may hold this body under. */
  private heldFor(scope: string, fingerprint: string): HeldKey | undefined {
    return this.pending.get(scope)?.find((entry) => entry.held.includes(fingerprint));
  }

  private hold(scope: string, entry: HeldKey) {
    const list = this.pending.get(scope) ?? [];
    if (list.includes(entry)) return;
    list.push(entry);
    if (list.length > MAX_HELD_KEYS_PER_SCOPE) list.shift();
    this.pending.set(scope, list);
  }

  /** Let go of this key only; other drawers' keys in the scope stay. */
  private release(scope: string, entry: HeldKey) {
    const list = this.pending.get(scope)?.filter((e) => e !== entry);
    if (list?.length) this.pending.set(scope, list);
    else this.pending.delete(scope);
  }
}

/** The app-wide store of unsettled Office Record keys. */
export const officeSubmitKeys = new OfficeSubmitKeys();

/**
 * Sends one body under the session's key and records the outcome: saved
 * releases the key, an unknown outcome keeps it for the same body (#538, one
 * helper for every keyed save).
 */
export async function sendKeyed<T>(
  session: SubmitKeySession,
  body: unknown,
  send: (idempotencyKey: string) => Promise<T>,
): Promise<T> {
  const key = session.next(JSON.stringify(body ?? null));
  try {
    const result = await send(key);
    session.settle();
    return result;
  } catch (err) {
    session.settle(err);
    throw err;
  }
}
