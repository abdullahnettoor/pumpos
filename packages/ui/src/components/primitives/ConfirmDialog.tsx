import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
 * `useConfirm` for code that may render outside a `<ConfirmProvider>` (a
 * shared guard, a test render): null there, so the caller can fall back.
 */
export const useOptionalConfirm = (): ((options: ConfirmOptions) => Promise<boolean>) | null => {
  const ask = useContext(ConfirmContext);
  return useMemo(
    () => (ask ? async (options: ConfirmOptions) => (await ask(options)).confirmed : null),
    [ask],
  );
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
          // Above drawers (1001): a confirm is often asked from inside one. The
          // scrim takes the dialog blur (#604); a drawer's scrim does not.
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-(--overlay-scrim) p-4 backdrop-blur-(--overlay-blur)"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={state.title}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex w-full max-w-105 flex-col gap-3 rounded-card border border-border-soft bg-surface p-5 font-sans shadow-(--shadow-dialog)"
          >
            <h2 className="text-[15px] font-semibold text-ink-strong">{state.title}</h2>
            {state.message != null && (
              <div className="text-[13px] leading-[1.5] text-ink-muted">{state.message}</div>
            )}
            {state.input && (
              <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-ink-strong">
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
            <div className="mt-1 flex justify-end gap-2">
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
