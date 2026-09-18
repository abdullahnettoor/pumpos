import { useSyncExternalStore } from 'react';
import type { TitleBarIntegration, WindowControlCommands } from '../pump-ds/shell/index.js';

/**
 * Desktop title-bar integration (#117).
 *
 * The desktop window hides its native title strip so the app's own top bar IS
 * the title bar: dragging it moves the window, double-clicking it zooms, and
 * the OS window controls sit inset within it rather than on a second bar above.
 *
 * Which side to reserve, how much, and whether the app has to draw the buttons
 * itself are all platform facts the shared UI must not guess at:
 *
 *   - macOS keeps a native (overlay) title bar, so the traffic lights are still
 *     painted by the OS on the LEFT — the app only reserves room for them.
 *   - Windows/Linux windows are undecorated, so the app reserves room on the
 *     RIGHT and renders the buttons, wired to the native window commands.
 *   - The web console has no title bar at all and stays untouched.
 *
 * The desktop shell registers the details at startup via `setDesktopTitleBar`
 * (the same injection pattern as `setPdfSaver` / `setExternalOpener`), which
 * keeps `@pump/ui` free of any dependency on `@tauri-apps/api`.
 */

export interface DesktopWindowState {
  /** In full screen the OS hides its controls — the reserved inset collapses. */
  fullscreen: boolean;
  maximized: boolean;
}

/** Native window commands, provided only when the app draws its own buttons. */
export type DesktopWindowControls = WindowControlCommands;

export interface DesktopTitleBar {
  /** Side of the top bar the host platform's window controls occupy. */
  controlsSide: 'left' | 'right';
  /** Space (px) to reserve on that side so nothing overlaps the controls. */
  controlsInset: number;
  /** Non-null when the window is undecorated and the app must draw the buttons. */
  controls: DesktopWindowControls | null;
  getState: () => DesktopWindowState;
  subscribe: (onChange: () => void) => () => void;
}

let titleBar: DesktopTitleBar | null = null;
const registryListeners = new Set<() => void>();

/** Called once by the desktop shell at startup. */
export function setDesktopTitleBar(next: DesktopTitleBar | null): void {
  titleBar = next;
  registryListeners.forEach((listener) => listener());
}

/**
 * The title bar as the top bar should render it right now: `null` on the web.
 *
 * Full screen only collapses the reserved inset — that space exists for
 * controls the OS paints over the bar, and in full screen the OS hides them.
 * The app's OWN buttons must survive: an undecorated window in full screen has
 * no other way back out, since there is no OS chrome to fall back on.
 */
export function resolveTitleBar(
  bar: DesktopTitleBar | null,
  state: DesktopWindowState,
): TitleBarIntegration | null {
  if (!bar) return null;
  return {
    controlsSide: bar.controlsSide,
    controlsInset: state.fullscreen ? 0 : bar.controlsInset,
    controls: bar.controls,
    maximized: state.maximized,
  };
}

const DEFAULT_STATE: DesktopWindowState = { fullscreen: false, maximized: false };

function subscribeAll(onChange: () => void): () => void {
  registryListeners.add(onChange);
  const stopWindow = titleBar?.subscribe(onChange);
  return () => {
    registryListeners.delete(onChange);
    stopWindow?.();
  };
}

/**
 * Snapshot identity matters to `useSyncExternalStore` — it re-renders whenever
 * the returned object differs by reference. Cache the last resolved value and
 * hand back the same object while nothing meaningful changed.
 */
let cachedSnapshot: TitleBarIntegration | null = null;

function readSnapshot(): TitleBarIntegration | null {
  const next = resolveTitleBar(titleBar, titleBar?.getState() ?? DEFAULT_STATE);
  const prev = cachedSnapshot;
  const unchanged =
    (next === null && prev === null) ||
    (next !== null &&
      prev !== null &&
      next.controlsSide === prev.controlsSide &&
      next.controlsInset === prev.controlsInset &&
      next.controls === prev.controls &&
      next.maximized === prev.maximized);
  if (!unchanged) cachedSnapshot = next;
  return cachedSnapshot;
}

/** Server/SSR snapshot: no window chrome to integrate with. */
const readServerSnapshot = () => null;

export function useDesktopTitleBar(): TitleBarIntegration | null {
  return useSyncExternalStore(subscribeAll, readSnapshot, readServerSnapshot);
}
