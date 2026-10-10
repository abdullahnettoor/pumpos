/**
 * Navigation for the shell: tab selection plus a push/pop stack of detail pages
 * per tab, kept in step with the browser history so the system back gesture
 * pops the stack (or closes an open sheet) instead of leaving the app.
 *
 * What a feature ticket needs:
 *   const nav = useNav();
 *   nav.push(<ShiftSummaryPage shiftId={id} />, `shift:${id}`);  // detail page in the current tab
 *   nav.open('money', <CustomerPage id={id} />, `customer:${id}`); // jump to another tab's stack
 *   nav.back();                                                  // what the header back button calls
 * and, in a sheet, `useBackLayer(open, onClose)` (BottomSheet already does).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  clampActive,
  initialNavState,
  navReducer,
  stackOf,
  type NavAction,
  type NavState,
  type StackEntry,
} from './navStack.js';
import { BackStackContext, type BackStack } from '../ui/backStack.js';
import type { TabKey } from './tabs.js';

export { useBackLayer } from '../ui/backStack.js';

export interface Nav {
  active: TabKey;
  tabs: readonly TabKey[];
  visited: readonly TabKey[];
  stacks: NavState['stacks'];
  /** Pushed pages on the active tab (0 = showing the tab's own screen). */
  depth: number;
  select: (tab: TabKey, options?: { toRoot?: boolean }) => void;
  /** Push a detail page onto the active tab. Pass a stable `id` so a double tap pushes once. */
  push: (element: React.ReactNode, id?: string) => void;
  /** Switch to `tab` and push a detail page there. */
  open: (tab: TabKey, element: React.ReactNode, id?: string) => void;
  /** Header back button: pops through the browser history so history and stack stay aligned. */
  back: () => void;
  /** Drop every stack (e.g. after switching station: pages belong to the old one). */
  reset: () => void;
}

const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav must be used inside <NavProvider>');
  return nav;
}

/**
 * Keep browser history one entry per layer (pushed page or open sheet).
 * `onBack` runs when the user goes back (system gesture or `back()`), and must
 * close the top layer; returning `false` means it stayed (a guarded page), and
 * the history entry the gesture consumed is put back. Entries are added when layers grow and unwound with
 * `history.go` when layers shrink for any other reason.
 */
function useBackLayers(layers: number, onBack: () => boolean | void): () => void {
  const layersRef = useRef(layers);
  const pushed = useRef(0);
  const ignorePops = useRef(0);
  const onBackRef = useRef(onBack);
  useLayoutEffect(() => {
    onBackRef.current = onBack;
  });

  const sync = useCallback(() => {
    // A `history.go` is still in flight: its popstate re-runs this when it lands,
    // so a push never races the traversal it would be undone by.
    if (ignorePops.current > 0) return;
    const target = layersRef.current;
    if (pushed.current < target) {
      for (let i = pushed.current; i < target; i++) window.history.pushState({ pumpLayer: i }, '');
      pushed.current = target;
    } else if (pushed.current > target) {
      const extra = pushed.current - target;
      pushed.current = target;
      ignorePops.current += 1;
      window.history.go(-extra);
    }
  }, []);

  useEffect(() => {
    layersRef.current = layers;
    sync();
  }, [layers, sync]);

  useEffect(() => {
    const onPop = () => {
      if (ignorePops.current > 0) {
        ignorePops.current -= 1;
        sync();
        return;
      }
      pushed.current = Math.max(0, pushed.current - 1);
      if (onBackRef.current() === false) sync();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [sync]);

  return useCallback(() => {
    if (pushed.current > 0) window.history.back();
    else onBackRef.current();
  }, []);
}

export const NavProvider: React.FC<{ tabs: readonly TabKey[]; children: React.ReactNode }> = ({
  tabs,
  children,
}) => {
  const reducer = useCallback(
    (state: NavState, action: NavAction) => navReducer(clampActive(state, tabs), action),
    [tabs],
  );
  const [raw, dispatch] = useReducer(reducer, tabs[0] ?? 'home', initialNavState);
  const state = useMemo(() => clampActive(raw, tabs), [raw, tabs]);

  const overlays = useRef<Array<() => void>>([]);
  const [overlayCount, setOverlayCount] = useState(0);
  const registerOverlay = useCallback((close: () => void) => {
    overlays.current = [...overlays.current, close];
    setOverlayCount((n) => n + 1);
    return () => {
      overlays.current = overlays.current.filter((f) => f !== close);
      setOverlayCount((n) => n - 1);
    };
  }, []);

  const guards = useRef<Array<() => boolean>>([]);
  const registerGuard = useCallback((allow: () => boolean) => {
    guards.current = [...guards.current, allow];
    return () => {
      guards.current = guards.current.filter((f) => f !== allow);
    };
  }, []);

  const depth = stackOf(state, state.active).length;
  const nextId = useRef(0);
  const entry = useCallback((element: React.ReactNode, id?: string): StackEntry => {
    return { id: id ?? `page-${nextId.current++}`, element };
  }, []);

  const closeTopLayer = useCallback(() => {
    const top = overlays.current[overlays.current.length - 1];
    if (top) {
      top();
      return true;
    }
    // The shown page may ask first (unsaved work); it stays when the guard says no.
    const guard = guards.current[guards.current.length - 1];
    if (guard && !guard()) return false;
    dispatch({ type: 'pop' });
    return true;
  }, []);
  const back = useBackLayers(depth + overlayCount, closeTopLayer);

  const value = useMemo<Nav>(
    () => ({
      active: state.active,
      tabs,
      visited: state.visited,
      stacks: state.stacks,
      depth,
      select: (tab, options) => dispatch({ type: 'select', tab, toRoot: options?.toRoot }),
      push: (element, id) => dispatch({ type: 'push', entry: entry(element, id) }),
      open: (tab, element, id) => dispatch({ type: 'open', tab, entry: entry(element, id) }),
      back,
      reset: () => dispatch({ type: 'reset' }),
    }),
    [state, tabs, depth, back, entry],
  );
  const backStack = useMemo<BackStack>(
    () => ({ back, registerOverlay, registerGuard }),
    [back, registerOverlay, registerGuard],
  );

  return (
    <BackStackContext.Provider value={backStack}>
      <NavContext.Provider value={value}>{children}</NavContext.Provider>
    </BackStackContext.Provider>
  );
};
