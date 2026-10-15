import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '../../pump-ds/icon/index.js';
import { cn } from '../../pump-ds/lib/cn.js';

export type ToastVariant = 'error' | 'success' | 'info';

/** A button on the toast: "View summary", "Open expenses". Clicking it dismisses the toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title?: string;
  /**
   * Auto-dismiss delay in ms; 0 keeps the toast until it is dismissed.
   * Defaults to 4000 for a success or info, 0 for an error (#606): an error
   * stays until the operator has read it.
   */
  duration?: number;
  /** An optional next step on the toast (#606). */
  action?: ToastAction;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface ToastApi {
  show: (message: string, variant?: ToastVariant, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
  success: (message: string, opts?: ToastOptions) => void;
  info: (message: string, opts?: ToastOptions) => void;
}

/** Toasts on screen at once; a newer one pushes the oldest out (#606). */
export const MAX_TOASTS = 3;
/** How long a success or info toast stays. */
export const TOAST_DURATION_MS = 4000;

const ToastContext = createContext<ToastApi | null>(null);

/** Non-blocking toast notifications, replacing native `alert`. */
export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
};

/**
 * The toast api if there is a provider above, otherwise null.
 *
 * For shared primitives that want to report a failure when they are inside an
 * app, but must still render in isolation — design-system pages, tests — where
 * no provider exists. Application code should use `useToast` and fail loudly.
 */
export const useOptionalToast = (): ToastApi | null => useContext(ToastContext);

const VARIANT: Record<ToastVariant, { icon: IconName; badge: string }> = {
  success: { icon: 'check', badge: 'bg-success-bg text-success-fg' },
  error: { icon: 'alert-triangle', badge: 'bg-danger-bg text-danger-fg' },
  info: { icon: 'info', badge: 'bg-info-bg text-info-fg' },
};

/**
 * An error toast's text: the reason, then what to do next (#606). The reason
 * is usually the server's own message; `next` is the step the screen offers.
 */
export function withNextStep(reason: string | null | undefined, next: string): string {
  const r = (reason ?? '').trim();
  return r ? `${/[.!?…]$/.test(r) ? r : `${r}.`} ${next}` : next;
}

/**
 * The stack as it should read after adding a toast: newest last, at most
 * `MAX_TOASTS`. An error is never pushed out (#606 review): past the limit the
 * oldest success or info goes, even the new one. Only errors can exceed it.
 */
export function pushToast<T extends { variant: ToastVariant }>(
  stack: readonly T[],
  toast: T,
  max = MAX_TOASTS,
): T[] {
  const next = [...stack, toast];
  while (next.length > max) {
    const i = next.findIndex((t) => t.variant !== 'error');
    if (i < 0) break;
    next.splice(i, 1);
  }
  return next;
}

/**
 * One toast host per app (#606): bottom centre, just above the status bar (on
 * mobile, above the dock: `--toast-offset`), one stack of at most three. A
 * toast is the secondary signal; the row a save updates is the primary one.
 * Inverted surface for contrast in both themes. Successes leave after four
 * seconds; errors stay until dismissed.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info', opts?: ToastOptions) => {
      const id = ++idRef.current;
      const duration = opts?.duration ?? (variant === 'error' ? 0 : TOAST_DURATION_MS);
      setToasts((prev) => pushToast(prev, { id, message, variant, ...opts }));
      if (duration > 0) window.setTimeout(() => remove(id), duration);
    },
    [remove],
  );

  const error = useCallback((m: string, o?: ToastOptions) => show(m, 'error', o), [show]);
  const success = useCallback((m: string, o?: ToastOptions) => show(m, 'success', o), [show]);
  const info = useCallback((m: string, o?: ToastOptions) => show(m, 'info', o), [show]);

  // `show` and `remove` are already stable, so memoising the object makes the
  // whole context value stable for the life of the provider. Without this the
  // value was a fresh literal on every render, which (a) re-rendered every
  // consumer each time a toast appeared or expired, and (b) would make anything
  // derived from it — such as `useRunTask` — unusable as an effect dependency.
  const api = useMemo<ToastApi>(
    () => ({ show, error, success, info }),
    [show, error, success, info],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-[calc(var(--toast-offset)+12px)] left-1/2 z-[1100] flex w-[min(480px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((t) => {
          const v = VARIANT[t.variant];
          return (
            <div
              key={t.id}
              role={t.variant === 'error' ? 'alert' : 'status'}
              aria-live={t.variant === 'error' ? 'assertive' : 'polite'}
              data-variant={t.variant}
              className="pointer-events-auto flex items-start gap-3 rounded-card bg-ink-strong px-4 py-3 font-sans text-[14px] text-surface shadow-(--shadow-popover)"
            >
              <span
                className={cn(
                  'mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full',
                  v.badge,
                )}
                aria-hidden="true"
              >
                <Icon name={v.icon} size="xs" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {t.title && <strong className="font-semibold">{t.title}</strong>}
                <span className="leading-5">{t.message}</span>
              </div>
              {t.action && (
                <button
                  type="button"
                  className="shrink-0 rounded-input px-2 py-1 text-[13px] font-semibold text-surface underline underline-offset-2 hover:bg-surface/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-surface"
                  onClick={() => {
                    remove(t.id);
                    t.action!.onClick();
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-input text-surface/80 hover:bg-surface/10 hover:text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-surface"
                onClick={() => remove(t.id)}
              >
                <Icon name="x" size="sm" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
