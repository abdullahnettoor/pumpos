import { useRef, useState } from 'react';
import { officeSubmitKeys, sendKeyed } from './submitKeys.js';

/**
 * useKeyedSave: the one keyed-save helper for office forms (#538). Callers:
 * Accounts drawers, Team drawers, Organization profile, Station & Pricing (#584).
 *
 * API
 *   const save = useKeyedSave('team:update:<userId>');
 *   await save(body, (idempotencyKey) => service.call(body, { idempotencyKey }));
 *
 * Session lifecycle
 * - One session per mount = one logical submit. Mount the drawer or form fresh
 *   on each open (give it a `key`), so a new record never inherits the last
 *   record's key.
 * - Saved, or a decided refusal (4xx): the key is released; the next save in
 *   the same form gets a new key.
 * - `save.renew()` starts a new submit in the same form (an in-page form's
 *   Discard): the next save gets a new key, or recovers a held one for the
 *   same body from the shared store.
 * - Unknown outcome (network drop, 5xx, in progress, key conflict): the key is
 *   kept, so saving again cannot record twice. A new form entering the same
 *   body recovers that key from the shared store (`officeSubmitKeys`); a
 *   different body gets a fresh one.
 *
 * Scope names one route (and its record): the API refuses a key sent to
 * another path. Outside a component, use `sendKeyed(officeSubmitKeys.session(scope), …)`.
 */
export type KeyedSave = (<T>(
  body: unknown,
  send: (idempotencyKey: string) => Promise<T>,
) => Promise<T>) & {
  /**
   * Starts a new logical submit in the same mounted form (an in-page form's
   * Discard, #604): the next save never inherits a key left unsettled.
   */
  renew: () => void;
};

export function useKeyedSave(scope: string): KeyedSave {
  const [initial] = useState(() => officeSubmitKeys.session(scope));
  const session = useRef(initial);
  const save = (<T>(body: unknown, send: (idempotencyKey: string) => Promise<T>) =>
    sendKeyed(session.current, body, send)) as KeyedSave;
  save.renew = () => {
    session.current = officeSubmitKeys.session(scope);
  };
  return save;
}
