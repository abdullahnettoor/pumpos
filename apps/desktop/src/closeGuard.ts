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

/** Called only from the Tauri shell, so `@tauri-apps/api` stays out of the web bundle. */
export async function installCloseGuard(
  unsaved: () => boolean,
  confirmDiscard: () => Promise<boolean>,
): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();
  await appWindow.onCloseRequested(async (event) => {
    if (!unsaved()) return; // Tauri closes the window itself.
    event.preventDefault();
    if (await shouldCloseWindow(unsaved, confirmDiscard)) await appWindow.destroy();
  });
}
