import { useCallback } from 'react';
import { useToast, withNextStep } from '../components/primitives/ToastProvider.js';

/**
 * Starts an async task from a synchronous context — a React effect or a DOM
 * event handler — where there is no caller to `await` into.
 *
 * The rejection handler is the whole point. Without one, a rejected task is
 * silent: no error surfaces, the screen keeps its pre-action state, and the
 * operator believes the action succeeded. In a package that records
 * collections, expenses and shift closes, that is a money-visible failure.
 *
 * Prefer `await` wherever the calling function is already async. Reach for this
 * only at the sync boundary.
 */
export function runTask(
  task: void | undefined | Promise<unknown>,
  onError: (error: unknown) => void,
): void {
  // Accepts `void | Promise` so it can wrap the many callback slots typed that
  // way. A synchronous handler simply has nothing to attach to.
  if (task instanceof Promise) task.catch(onError);
}

/**
 * `runTask` bound to the toast surface, so a failed background task tells the
 * operator instead of only the console.
 *
 * `message` is operator-facing, so write it as the action that failed
 * ("Could not load tanks."), not as the exception.
 */
export function useRunTask(): (task: void | undefined | Promise<unknown>, message: string) => void {
  const toast = useToast();
  return useCallback(
    (task: void | undefined | Promise<unknown>, message: string) => {
      runTask(task, (error) => {
        // Keep the stack for the console; give the operator the plain message.
        console.error(message, error);
        // Errors say what to do next (#606): a background task can be redone.
        toast.error(withNextStep(message, 'Try again; if it keeps failing, reload the page.'));
      });
    },
    [toast],
  );
}

/** How long a "Saved. Couldn't refresh" toast stays (it auto-dismisses, #606). */
export const REFRESH_FAILED_MS = 6000;

/**
 * Starts the background refresh after a save whose answer already put
 * everything on screen (#606, owner decision). If the refresh fails, the save
 * still stands: a short toast says so, with Retry, and leaves on its own.
 * Where the answer leaves totals unconfirmed (a Handover), the page shows an
 * inline Retry instead (see `UnconfirmedTotalsNote`), not this.
 *
 * `refresh` must reject on failure (`invalidate(stationId, { throwOnError: true })`).
 */
export function useRefreshTask(): (refresh: () => Promise<unknown>, saved: string) => void {
  const toast = useToast();
  return useCallback(
    (refresh: () => Promise<unknown>, saved: string) => {
      const start = () =>
        runTask(refresh(), (error) => {
          console.error(saved, error);
          toast.error(`${saved} Couldn't refresh the screen.`, {
            duration: REFRESH_FAILED_MS,
            action: { label: 'Retry', onClick: start },
          });
        });
      start();
    },
    [toast],
  );
}
