import { useState } from 'react';
import { officeSubmitKeys } from '../../office-records/submitKeys.js';

/**
 * A setup save under one Idempotency-Key (#537), through the shared
 * `officeSubmitKeys` store: kept while the outcome is unknown (a dropped
 * connection), renewed once the server answers. Scope it to the route and
 * station, so a key is only ever reused on the same request target.
 */
export function useKeyedSave(scope: string) {
  const [session] = useState(() => officeSubmitKeys.session(`setup:${scope}`));
  return async <T>(body: unknown, send: (idempotencyKey: string) => Promise<T>): Promise<T> => {
    const key = session.next(JSON.stringify(body));
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
