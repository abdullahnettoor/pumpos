/**
 * The seam between UI primitives and the shell's navigation: a primitive that
 * must take part in the system back gesture (a sheet) or go back (a detail
 * header) reads it from here, so `ui/` never imports from `shell/`. The shell's
 * `NavProvider` supplies the value; without one (a primitive rendered on its
 * own) back does nothing and overlays only close by their own controls.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Whether the page rendering this is the one on screen (the top of the active
 * tab's stack). The shell's `Pane` provides it; outside a pane a page counts as
 * shown. Hidden pages stay mounted, so only the shown one may guard back.
 */
export const PageActiveContext = createContext(true);

export interface BackStack {
  /** Go back one layer (pops the page, or closes the top overlay). */
  back: () => void;
  /** While registered, the system back gesture calls `close`. Returns the unregister. */
  registerOverlay: (close: () => void) => () => void;
  /**
   * While registered, going back from the shown page first asks `allow`: true
   * lets the page go, false keeps it (the guard has shown its own prompt).
   * Overlays above the page close first. Returns the unregister.
   */
  registerGuard: (allow: () => boolean) => () => void;
}

export const BackStackContext = createContext<BackStack | null>(null);

/** The header back button's action. */
export function useBack(): () => void {
  const stack = useContext(BackStackContext);
  return stack ? stack.back : noop;
}

function noop() {}

/** While `open`, the system back gesture calls `onClose` (a sheet or other overlay). */
export function useBackLayer(open: boolean, onClose: () => void): void {
  const register = useContext(BackStackContext)?.registerOverlay;
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open || !register) return;
    return register(() => closeRef.current());
  }, [open, register]);
}

/**
 * While `when` and this page is the one on screen, going back (the header
 * button or the system gesture) calls `allow` first; it returns true to let the
 * page go, false to stay (show a discard prompt, say). A page with unsaved work:
 *
 *   useBackGuard(dirty, () => { setAsking(true); return false; });
 */
export function useBackGuard(when: boolean, allow: () => boolean): void {
  const register = useContext(BackStackContext)?.registerGuard;
  const shown = useContext(PageActiveContext);
  const allowRef = useRef(allow);
  useLayoutEffect(() => {
    allowRef.current = allow;
  });
  useEffect(() => {
    if (!when || !shown || !register) return;
    return register(() => allowRef.current());
  }, [when, shown, register]);
}
