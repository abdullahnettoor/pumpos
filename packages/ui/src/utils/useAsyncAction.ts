import { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionalToast } from '../components/primitives/ToastProvider.js';

/**
 * Runs an async handler that was handed to a void-returning callback slot — a
 * button's `onClick`, a form's `onSubmit`, a checkbox's `onChange`.
 *
 * Two things every such control needs, and which each was implementing
 * separately before:
 *
 * - **A pending flag**, so the control stops claiming the work is finished the
 *   instant it was started. Callers disable themselves while `pending` is set.
 * - **A rejection path**, so a failure reaches the operator instead of becoming
 *   an unhandled rejection.
 *
 * `onError` overrides the default. Controls whose callers can say something
 * specific should catch inside the handler and render their own inline error;
 * the default is the generic fallback for everything else.
 */
export function useAsyncAction<A extends unknown[]>(
  handler: ((...args: A) => void | Promise<unknown>) | undefined,
  failureMessage: string,
  onError?: (error: unknown) => void,
): { pending: boolean; run: (...args: A) => void } {
  const toast = useOptionalToast();
  // The work routinely outlives the control: a successful submit closes the
  // drawer that owns the button. Track mounted so settling never writes to an
  // unmounted component. Re-set on every effect run, so React 18 StrictMode's
  // mount/unmount/mount cycle leaves it true rather than permanently false.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [pending, setPending] = useState(false);

  const run = useCallback(
    (...args: A) => {
      const result = handler?.(...args);
      if (!(result instanceof Promise)) return;
      setPending(true);
      result
        .catch((error: unknown) => {
          if (onError) {
            onError(error);
            return;
          }
          // Keep the stack for the console; give the operator the plain message.
          console.error(failureMessage, error);
          toast?.error(failureMessage);
        })
        .finally(() => {
          if (mounted.current) setPending(false);
        });
    },
    [handler, failureMessage, onError, toast],
  );

  return { pending, run };
}
