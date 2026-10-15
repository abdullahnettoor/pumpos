import { useRef } from 'react';
import { officeSubmitKeys, type SubmitKeySession } from './submitKeys.js';

/** Sends one body under its Idempotency-Key and settles the key with the outcome. */
export type KeyedSave = <T>(
  scope: string,
  body: unknown,
  send: (idempotencyKey: string) => Promise<T>,
) => Promise<T>;

/**
 * Saves under `officeSubmitKeys`, one session per `scope` (#538). The API
 * refuses a key sent to another path, so a scope names one route (and the
 * record it writes): `team:update:<userId>`, `team:reset:<userId>`. A save
 * whose outcome is unknown keeps its key, so saving again cannot apply twice.
 */
export function useKeyedSaves(): KeyedSave {
  const sessions = useRef(new Map<string, SubmitKeySession>());
  return async (scope, body, send) => {
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
}
