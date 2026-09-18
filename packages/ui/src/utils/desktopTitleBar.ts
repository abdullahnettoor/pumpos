import { useSyncExternalStore } from 'react';

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
export interface DesktopWindowControls {
  minimize: () => void | Promise<void>;
  toggleMaximize: () => void | Promise<void>;
  close: () => void | Promise<void>;
}

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

const NOT_DESKTOP = null;

let titleBar: DesktopTitleBar | null = NOT_DESKTOP;
const registryListeners = new Set<() => void>();

/** Called once by the desktop shell at startup. */
export function setDesktopTitleBar(next: DesktopTitleBar | null): void {
  titleBar = next;
  registryListeners.forEach((listener) => listener());
}

export function getDesktopTitleBar(): DesktopTitleBar | null {
  return titleBar;
}

/**
 * The title bar as the top bar should render it right now: `null` on the web,
 * and on desktop an inset that collapses to 0 in full screen (where the OS
 * hides its controls) — so the app's own controls reclaim that space.
 */
export interface ResolvedTitleBar {
  controlsSide: 'left' | 'right';
  controlsInset: number;
  controls: DesktopWindowControls | null;
  maximized: boolean;
}

export function resolveTitleBar(
  bar: DesktopTitleBar | null,
  state: DesktopWindowState,
): ResolvedTitleBar | null {
  if (!bar) return null;
  return {
    controlsSide: bar.controlsSide,
    controlsInset: state.fullscreen ? 0 : bar.controlsInset,
    controls: state.fullscreen ? null : bar.controls,
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
let cachedSnapshot: ResolvedTitleBar | null = null;

function readSnapshot(): ResolvedTitleBar | null {
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

export function useDesktopTitleBar(): ResolvedTitleBar | null {
  return useSyncExternalStore(subscribeAll, readSnapshot, readServerSnapshot);
}

/** Test-only: drop any registered title bar and cached snapshot. */
export function resetDesktopTitleBar(): void {
  cachedSnapshot = null;
  setDesktopTitleBar(NOT_DESKTOP);
}
