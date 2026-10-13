import { focusManager } from '@tanstack/react-query';

/** A focus and a visibilitychange from one window switch land within this. */
const DEDUPE_MS = 1_000;

/**
 * TanStack Query v5 treats only `visibilitychange` as "focus". That fires on a
 * tab switch or a minimise, but NOT when an operator Alt-/⌘-Tabs to another app
 * and back while the window stays visible — the common desktop case (Tauri
 * included). Treat the window `focus` event as focus too, so coming back to
 * PumpOS refetches stale live data. Data within its stale time is untouched;
 * nothing is fetched while the window is unfocused (no polling).
 */
export function windowFocusListener(onFocus: (focused?: boolean) => void): () => void {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  let last = Number.NEGATIVE_INFINITY;
  const handle = () => {
    if (globalThis.document?.visibilityState === 'hidden') return;
    const now = Date.now();
    if (now - last < DEDUPE_MS) return;
    last = now;
    onFocus();
  };
  window.addEventListener('visibilitychange', handle, false);
  window.addEventListener('focus', handle, false);
  return () => {
    window.removeEventListener('visibilitychange', handle);
    window.removeEventListener('focus', handle);
  };
}

/** Install once; safe to call again (it replaces the previous listener). */
export function installWindowFocusRefetch(): void {
  focusManager.setEventListener(windowFocusListener);
}
