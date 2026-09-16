import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Button, Input } from '../../pump-ds/index.js';

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in a destructive (red) style. */
  danger?: boolean;
  /** Optional free-text field captured with the confirmation (e.g. a void reason). */
  input?: { label: string; placeholder?: string; required?: boolean };
}

export interface ConfirmResult {
  confirmed: boolean;
  /** Trimmed `input` value; empty when no input was configured. */
  value: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based confirmation, replacing native `window.confirm`. Wrap the app
 * once in `<ConfirmProvider>`, then `const confirm = useConfirm()` and
 * `if (!(await confirm({ title, message, danger: true }))) return;`.
 */
export const useConfirm = (): ((options: ConfirmOptions) => Promise<boolean>) => {
  const ask = useAsk();
  return useCallback(async (options: ConfirmOptions) => (await ask(options)).confirmed, [ask]);
};

/**
 * Like `useConfirm`, but resolves `{ confirmed, value }` so a dialog can also
 * capture a short free-text `input` (e.g. the reason for voiding an entry).
 */
export const useAsk = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useAsk must be used within a <ConfirmProvider>');
  return ctx;
};

interface State extends ConfirmOptions {
  open: boolean;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<State>({ open: false, title: '' });
  const [inputValue, setInputValue] = useState('');
  const resolver = useRef<((value: ConfirmResult) => void) | null>(null);
  const valueRef = useRef('');

  const confirm = useCallback<ConfirmFn>((options) => {
    setInputValue('');
    valueRef.current = '';
    setState({ ...options, open: true });
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolver.current?.({ confirmed: result, value: result ? valueRef.current.trim() : '' });
    resolver.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Enter') {
        if (state.input?.required && valueRef.current.trim() === '') return;
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open, state.input, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open && (
        <div
          role="presentation"
          onMouseDown={() => close(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            padding: '16px',
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={state.title}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>
              {state.title}
            </h2>
            {state.message != null && (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {state.message}
              </div>
            )}
            {state.input && (
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-strong)',
                }}
              >
                {state.input.label}
                <Input
                  inputSize="sm"
                  autoFocus
                  value={inputValue}
                  placeholder={state.input.placeholder}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    valueRef.current = e.target.value;
                  }}
                />
              </label>
            )}
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}
            >
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => close(false)}
                autoFocus={!state.input}
              >
                {state.cancelLabel || 'Cancel'}
              </Button>
              <Button
                type="button"
                variant={state.danger ? 'danger' : 'primary'}
                size="md"
                disabled={!!state.input?.required && inputValue.trim() === ''}
                onClick={() => close(true)}
              >
                {state.confirmLabel || 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
