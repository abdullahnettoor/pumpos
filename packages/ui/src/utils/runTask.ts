import { useCallback } from 'react';
import { useToast } from '../components/primitives/ToastProvider.js';

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
export function runTask(task: Promise<unknown>, onError: (error: unknown) => void): void {
  task.catch(onError);
}

/**
 * `runTask` bound to the toast surface, so a failed background task tells the
 * operator instead of only the console.
 *
 * `message` is operator-facing, so write it as the action that failed
 * ("Could not load tanks."), not as the exception.
 */
export function useRunTask(): (task: Promise<unknown>, message: string) => void {
  const toast = useToast();
  return useCallback(
    (task: Promise<unknown>, message: string) => {
      runTask(task, (error) => {
        // Keep the stack for the console; give the operator the plain message.
        console.error(message, error);
        toast.error(message);
      });
    },
    [toast],
  );
}
