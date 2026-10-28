/**
 * Pure state for the shell's navigation: the active tab, and one stack of
 * pushed detail pages per tab. The tab's own screen is the root and is never in
 * the stack. React and the browser history are layered on top in `nav.tsx`.
 */
import type { ReactNode } from 'react';
import type { TabKey } from '../lib/tabKey.js';

export interface StackEntry {
  /** Stable within the stack; a push whose id is already on top is ignored. */
  id: string;
  element: ReactNode;
}

export interface NavState {
  active: TabKey;
  stacks: Partial<Record<TabKey, StackEntry[]>>;
  /** Tabs opened at least once, in the order first opened. Visited tabs stay mounted. */
  visited: TabKey[];
  /**
   * A tab's requested view (`select(tab, { view })`): which segment its root
   * should show. `seq` grows on every request so a tab applies each one once,
   * even when the same view is asked for twice.
   */
  views: Partial<Record<TabKey, { view: string; seq: number }>>;
}

export type NavAction =
  | { type: 'select'; tab: TabKey; toRoot?: boolean; view?: string }
  | { type: 'push'; entry: StackEntry }
  | { type: 'open'; tab: TabKey; entry: StackEntry }
  | { type: 'pop' }
  | { type: 'reset' };

export const initialNavState = (active: TabKey): NavState => ({
  active,
  stacks: {},
  visited: [active],
  views: {},
});

export const stackOf = (
  state: Partial<NavState> & Pick<NavState, 'stacks'>,
  tab: TabKey,
): StackEntry[] => state.stacks[tab] ?? [];

const visit = (visited: TabKey[], tab: TabKey): TabKey[] =>
  visited.includes(tab) ? visited : [...visited, tab];

function pushOn(state: NavState, tab: TabKey, entry: StackEntry): NavState {
  const stack = stackOf(state, tab);
  if (stack[stack.length - 1]?.id === entry.id) return state;
  return { ...state, stacks: { ...state.stacks, [tab]: [...stack, entry] } };
}

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'select': {
      const next: NavState = {
        ...state,
        active: action.tab,
        visited: visit(state.visited, action.tab),
        views: action.view
          ? {
              ...state.views,
              [action.tab]: { view: action.view, seq: (state.views[action.tab]?.seq ?? 0) + 1 },
            }
          : state.views,
      };
      return action.toRoot ? { ...next, stacks: { ...state.stacks, [action.tab]: [] } } : next;
    }
    case 'push':
      return pushOn(state, state.active, action.entry);
    case 'open':
      return pushOn(
        { ...state, active: action.tab, visited: visit(state.visited, action.tab) },
        action.tab,
        action.entry,
      );
    case 'pop': {
      const stack = stackOf(state, state.active);
      if (stack.length === 0) return state;
      return { ...state, stacks: { ...state.stacks, [state.active]: stack.slice(0, -1) } };
    }
    case 'reset':
      return { ...state, stacks: {}, views: {} };
  }
}

/** Keep `active` within the tabs the Role may open (the list can change at runtime). */
export function clampActive(state: NavState, tabs: readonly TabKey[]): NavState {
  if (tabs.length === 0 || tabs.includes(state.active)) return state;
  return { ...state, active: tabs[0], visited: visit(state.visited, tabs[0]) };
}
