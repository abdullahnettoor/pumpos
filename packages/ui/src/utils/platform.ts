/**
 * Runtime platform detection for the shared UI.
 *
 * `isDesktopApp()` is true when running inside the Tauri desktop shell
 * (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux) rather than a
 * normal web browser. Tauri v2 injects `window.__TAURI_INTERNALS__` even when
 * the convenience `window.__TAURI__` global is disabled, so we key off that
 * (same check `apps/desktop/src/main.tsx` uses to register the native PDF saver).
 *
 * Use it to hide browser-only affordances the webview can't perform — notably
 * `window.print()`, which is a no-op in the Tauri webview. Desktop users use the
 * cross-platform "Save PDF" action instead.
 */
export const isDesktopApp = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
