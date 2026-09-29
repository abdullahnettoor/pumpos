import { setDesktopTitleBar, type DesktopWindowState } from '@pump/ui';

/**
 * Registers the desktop window's title-bar integration (#117).
 *
 * macOS only. There the window keeps a native overlay title bar
 * (`titleBarStyle: "Overlay"` + `hiddenTitle`), so the OS draws the traffic
 * lights on the left, floating over our top bar (`trafficLightPosition`
 * centres them on it). The app only reserves room for them.
 *
 * Windows and Linux use the native title bar (#326): the app's own buttons
 * existed only inside the signed-in shell, so the login and other takeover
 * screens had no way to move, minimise or close the window. Nothing is
 * registered there, so the top bar draws no buttons and no drag region.
 *
 * In full screen the OS hides its controls; the reported state drives the top
 * bar to drop both the reserved inset and its own buttons, so the bar lays out
 * edge to edge.
 *
 * Called only from the Tauri shell, so `@tauri-apps/api` never reaches the web
 * console bundle.
 */
export async function installDesktopTitleBar(): Promise<void> {
  if (!/Mac/i.test(navigator.userAgent)) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();

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
    controlsSide: 'left',
    // Room for the traffic lights (3 buttons, starting at x=16) plus the gap
    // before the menu icon.
    controlsInset: 84,
    controls: null,
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
