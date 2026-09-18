import { setDesktopTitleBar, type DesktopWindowState } from '@pump/ui';

/**
 * Registers the desktop window's title-bar integration (#117).
 *
 * The window hides its native title strip so the app's top bar becomes the
 * title bar. What that requires differs by platform:
 *
 *   - macOS keeps a native overlay title bar (`titleBarStyle: "Overlay"` +
 *     `hiddenTitle`), so the traffic lights are still drawn by the OS, on the
 *     left, floating over our bar. The app only reserves room for them.
 *   - Windows/Linux have no overlay mode, so the window is undecorated
 *     (`decorations: false`) and the app draws the buttons itself on the right,
 *     wired to the native window commands.
 *
 * In full screen the OS hides its controls; the reported state drives the top
 * bar to drop both the reserved inset and its own buttons, so the bar lays out
 * edge to edge.
 *
 * Called only from the Tauri shell, so `@tauri-apps/api` never reaches the web
 * console bundle.
 */
export async function installDesktopTitleBar(): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();

  const isMac = /Mac/i.test(navigator.userAgent);

  let state: DesktopWindowState = { fullscreen: false, maximized: false };
  const listeners = new Set<() => void>();

  const refresh = async () => {
    const [fullscreen, maximized] = await Promise.all([
      appWindow.isFullscreen(),
      appWindow.isMaximized(),
    ]);
    if (fullscreen === state.fullscreen && maximized === state.maximized) return;
    state = { fullscreen, maximized };
    listeners.forEach((listener) => listener());
  };

  // Every full-screen or maximise transition resizes the window, so one
  // subscription covers both. Tauri resolves it before the first paint that
  // could be wrong, and `refresh` no-ops when nothing actually changed.
  const stopResized = await appWindow.onResized(() => void refresh());
  void refresh();

  setDesktopTitleBar({
    controlsSide: isMac ? 'left' : 'right',
    // Room for the macOS traffic lights (3 buttons + window padding). Zero
    // elsewhere: our own buttons take real layout space instead.
    controlsInset: isMac ? 78 : 0,
    controls: isMac
      ? null
      : {
          minimize: () => appWindow.minimize(),
          toggleMaximize: () => appWindow.toggleMaximize(),
          close: () => appWindow.close(),
        },
    getState: () => state,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  });

  window.addEventListener('beforeunload', stopResized);
}
