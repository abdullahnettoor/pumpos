import { useSyncExternalStore } from 'react';

/**
 * Deep-link intent store — a tiny dependency-free external store
 * (useSyncExternalStore), the same shape as `quick-entry/store.ts`.
 *
 * A nav intent is a one-shot command ("open this customer's statement",
 * "highlight this tank") published by the command palette, quick-create menu,
 * notification bell or a dashboard card alongside a route change.
 *
 * It used to be threaded as a prop through both app shells and handled by each
 * destination in an effect. That made a *command* look like a *value*: the prop
 * is present on every render, so each screen had to hand-roll "have I already
 * dealt with this?" with a ref, and got its dependency list wrong doing it.
 *
 * Here the intent is published once, retained until consumed, and read with
 * `useNavIntent()` so destinations can **derive** from it during render rather
 * than copy it into state. Retention matters: the destination usually mounts
 * after the intent is published, and may need a query to land before it can act.
 */
export interface NavIntent {
  /** Focus a specific customer (opens their statement drawer). */
  focusCustomerId?: string;
  /** Focus a specific supplier (opens their statement drawer). */
  focusSupplierId?: string;
  /** Focus a specific inventory tab + entity (tank card / merchandise row). */
  focusInventoryTab?: 'tanks' | 'items';
  focusInventoryId?: string;
  /**
   * Open a drawer immediately on arrival at the destination page.
   *
   * `new-expense` / `new-income` / `new-collection` used to live here but were
   * fossils: the quick-entry store took over in-place entry and nothing emitted
   * them any more. They are deliberately not listed — a derived `isOpen` opens
   * a drawer without running the `openDrawer()` that seeds its form defaults,
   * so reviving one here would open an entry form with an empty target shift.
   * Route those through `openQuickEntry` instead.
   */
  open?: 'customer-statement' | 'new-customer' | 'supplier-statement' | 'supplier-payment';
  /** Open a specific past business day's DSSR summary (Reports page). */
  openDssrDate?: string;
  /** Open a specific Business Day in the Shifts workspace. */
  openBusinessDayDate?: string;
}

export interface NavIntentState {
  intent: NavIntent | null;
  /**
   * Bumps on every publish. Lets a consumer tell "the same intent again" from
   * "the intent I already dismissed" without comparing object identity — which
   * is what the old per-screen `handledIntentRef` was badly approximating.
   */
  token: number;
}

const EMPTY: NavIntentState = { intent: null, token: 0 };
let state: NavIntentState = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Publish a deep-link intent for whichever screen the navigation lands on. */
export function publishNavIntent(intent: NavIntent | null | undefined) {
  if (!intent) {
    clearNavIntent();
    return;
  }
  state = { intent, token: state.token + 1 };
  emit();
}

/**
 * Drop the pending intent. Call this when the operator does something that
 * supersedes it (dismissing the drawer it opened, picking a different tab), so
 * the deep link does not reassert itself on the next render.
 */
export function clearNavIntent() {
  if (!state.intent) return;
  state = { intent: null, token: state.token };
  emit();
}

export function subscribeToNavIntent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current store state. Prefer `useNavIntent()` in components. */
export const getNavIntentState = () => state;

/** The pending intent plus its token, for the rare consumer that must run an effect. */
export function useNavIntentEntry(): NavIntentState {
  return useSyncExternalStore(subscribeToNavIntent, getNavIntentState, getNavIntentState);
}

/** The pending intent, or null. Derive from it during render; do not copy it into state. */
export function useNavIntent(): NavIntent | null {
  return useSyncExternalStore(subscribeToNavIntent, getNavIntentState, getNavIntentState).intent;
}

/** Test seam: reset module state between cases. */
export function __resetNavIntentForTests() {
  state = EMPTY;
}
