import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type ToastVariant = 'error' | 'success' | 'info';

export interface ToastOptions {
  title?: string;
  /** Auto-dismiss delay in ms. Defaults to 4500 (6000 for errors). */
  duration?: number;
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

const VARIANT_STYLE: Record<ToastVariant, { border: string; bg: string; fg: string }> = {
  error: {
    border: 'var(--brand-danger)',
    bg: 'var(--state-danger-bg)',
    fg: 'var(--state-danger-fg)',
  },
  success: {
    border: 'var(--brand-success)',
    bg: 'var(--state-success-bg)',
    fg: 'var(--state-success-fg)',
  },
  info: { border: 'var(--brand-primary)', bg: 'var(--state-info-bg)', fg: 'var(--state-info-fg)' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info', opts?: ToastOptions) => {
      const id = ++idRef.current;
      const duration = opts?.duration ?? (variant === 'error' ? 6000 : 4500);
      setToasts((prev) => [...prev, { id, message, variant, ...opts }]);
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
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '380px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => {
          const s = VARIANT_STYLE[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              aria-live="polite"
              onClick={() => remove(t.id)}
              style={{
                pointerEvents: 'auto',
                cursor: 'pointer',
                backgroundColor: s.bg,
                color: s.fg,
                borderLeft: `3px solid ${s.border}`,
                border: '1px solid var(--border-soft)',
                borderLeftWidth: '3px',
                borderRadius: 'var(--radius-card)',
                boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                padding: '10px 14px',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {t.title && <strong style={{ fontSize: '13px', fontWeight: 600 }}>{t.title}</strong>}
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
