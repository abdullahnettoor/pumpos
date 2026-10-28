/**
 * The desktop window's close asks before dropping unsaved changes (#604).
 * `beforeunload` covers a browser tab; a Tauri window's close goes through
 * close-requested instead. Returns whether the close may go ahead.
 */
export async function shouldCloseWindow(
  unsaved: () => boolean,
  confirmDiscard: () => Promise<boolean>,
): Promise<boolean> {
  if (!unsaved()) return true;
  return confirmDiscard();
}

export interface CloseGuardDeps {
  unsaved: () => boolean;
  confirmDiscard: () => Promise<boolean>;
  /** Closes the window for good (Tauri `destroy`). */
  destroy: () => Promise<void>;
  /** Where a failed confirmation is reported. The window stays open. */
  report: (error: unknown) => void;
}

/**
 * One close request. With nothing unsaved it returns `false` and Tauri closes
 * the window itself. Otherwise it holds the close (`true`: prevent it), asks,
 * and destroys the window only on confirm. A confirmation that fails is
 * reported and leaves the window open; the next close asks again.
 */
export function handleCloseRequest(deps: CloseGuardDeps): boolean {
  if (!deps.unsaved()) return false;
  void (async () => {
    try {
      if (await shouldCloseWindow(deps.unsaved, deps.confirmDiscard)) await deps.destroy();
    } catch (error) {
      deps.report(error);
    }
  })();
  return true;
}

/** Called only from the Tauri shell, so `@tauri-apps/api` stays out of the web bundle. */
export async function installCloseGuard(
  unsaved: () => boolean,
  confirmDiscard: () => Promise<boolean>,
): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();
  await appWindow.onCloseRequested((event) => {
    const hold = handleCloseRequest({
      unsaved,
      confirmDiscard,
      destroy: () => appWindow.destroy(),
      report: (error) => console.error('[close guard] could not ask before closing', error),
    });
    if (hold) event.preventDefault();
  });
}
