/**
 * The seam between UI primitives and the shell's navigation: a primitive that
 * must take part in the system back gesture (a sheet) or go back (a detail
 * header) reads it from here, so `ui/` never imports from `shell/`. The shell's
 * `NavProvider` supplies the value; without one (a primitive rendered on its
 * own) back does nothing and overlays only close by their own controls.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';

export interface BackStack {
  /** Go back one layer (pops the page, or closes the top overlay). */
  back: () => void;
  /** While registered, the system back gesture calls `close`. Returns the unregister. */
  registerOverlay: (close: () => void) => () => void;
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
