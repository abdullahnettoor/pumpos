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

/**
 * Opening an external URL in the OS browser differs by platform: the web app
 * uses `window.open`, while the Tauri desktop shell needs a native opener
 * (`@tauri-apps/plugin-opener`) because in-webview navigation to external sites
 * is blocked. The desktop app can register that native opener at startup via
 * `setExternalOpener` (same injection pattern as `setPdfSaver`); until then we
 * fall back to `window.open`.
 */
export type ExternalOpener = (url: string) => void | Promise<void>;

const webOpener: ExternalOpener = (url) => {
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
};

let externalOpener: ExternalOpener = webOpener;

/** Desktop (Tauri) can register a native URL opener here at startup. */
export function setExternalOpener(fn: ExternalOpener) {
  externalOpener = fn;
}

/** Open a URL in the OS default browser (native on desktop, new tab on web). */
export async function openExternal(url: string): Promise<void> {
  await externalOpener(url);
}

