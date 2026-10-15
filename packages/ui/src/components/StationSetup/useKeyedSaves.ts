import { useRef } from 'react';
import { officeSubmitKeys, type SubmitKeySession } from '../../office-records/submitKeys.js';

/** Sends one body under its Idempotency-Key and settles the key with the outcome. */
export type KeyedSave = <T>(
  scope: string,
  body: unknown,
  send: (idempotencyKey: string) => Promise<T>,
) => Promise<T>;

export interface KeyedSaves {
  save: KeyedSave;
  /**
   * Forget this screen's sessions: call it when an edit is opened, so a save
   * from a new edit never inherits the key of one left unsettled before. The
   * shared store still hands an unsettled key back for the same body.
   */
  renew: () => void;
}

/**
 * Setup saves under `officeSubmitKeys` (#537), one session per `scope`. The
 * API refuses a key sent to another path, so a scope names one route and the
 * record it writes: `setup:tank:update:<id>`. A save whose outcome is unknown
 * keeps its key, so saving again cannot apply twice.
 *
 * TODO(#586): replace with the shared `office-records/useKeyedSaves` once it
 * lands; the `save` signature is the same.
 */
export function useKeyedSaves(): KeyedSaves {
  const sessions = useRef(new Map<string, SubmitKeySession>());
  const save: KeyedSave = async (scope, body, send) => {
    let session = sessions.current.get(scope);
    if (!session) {
      session = officeSubmitKeys.session(scope);
      sessions.current.set(scope, session);
    }
    const key = session.next(JSON.stringify(body ?? null));
    try {
      const result = await send(key);
      session.settle();
      return result;
    } catch (err) {
      session.settle(err);
      throw err;
    }
  };
  return { save, renew: () => sessions.current.clear() };
}
