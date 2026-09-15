import React from 'react';
import { useOptionalToast } from './ToastProvider.js';

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  label?: React.ReactNode;
  /** Muted helper line under the label. */
  description?: React.ReactNode;
  /**
   * May be async — some toggles ask the operator to confirm before they take
   * effect. The box is disabled while that is pending so it cannot be raced.
   */
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<unknown>;
}

/**
 * Shared async-change handling for the boolean controls.
 *
 * A toggle that writes through — activate a login, enable a terminal, confirm
 * before discarding dip readings — hands back a promise. Without this the
 * control looked settled the instant it was clicked, and a rejection vanished.
 * Here it stays disabled until the write settles, and a failure is reported.
 */
function useAsyncChange(
  onChange: ((event: React.ChangeEvent<HTMLInputElement>) => void | Promise<unknown>) | undefined,
  failureMessage: string,
) {
  const toast = useOptionalToast();
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [pending, setPending] = React.useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const result = onChange?.(event);
    if (!(result instanceof Promise)) return;
    setPending(true);
    result
      .catch((error: unknown) => {
        console.error(failureMessage, error);
        toast?.error(failureMessage);
      })
      .finally(() => {
        if (mounted.current) setPending(false);
      });
  };

  return { pending, handleChange };
}

/**
 * Native checkbox tinted with the brand colour (via `accent-color`) — accessible
 * and consistent without a bespoke re-implementation. Forwards its ref so it
 * drops into React Hook Form's `register`.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id, onChange, disabled, ...props }, ref) => {
    const { pending, handleChange } = useAsyncChange(onChange, 'That could not be changed.');
    const isDisabled = disabled || pending;
    return (
      <label
        className={cx('pump-check', isDisabled && 'pump-check--disabled', className)}
        htmlFor={id}
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className="pump-check-input"
          disabled={isDisabled}
          aria-busy={pending || undefined}
          onChange={handleChange}
          {...props}
        />
        {(label || description) && (
          <span className="pump-check-text">
            {label && <span className="pump-check-label">{label}</span>}
            {description && <span className="pump-check-desc">{description}</span>}
          </span>
        )}
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export interface SwitchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  /**
   * May be async. A switch usually writes through immediately (activate a
   * login, enable a terminal), so the returned promise is awaited and the
   * control is disabled while it is in flight — the toggle should not look
   * settled before the server agrees.
   */
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<unknown>;
}

/**
 * Boolean toggle switch. Visually a track + thumb, driven by a visually-hidden
 * native checkbox so it stays keyboard-accessible and RHF-compatible. Use for
 * instant on/off settings; use Checkbox inside forms that are submitted.
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, className, id, onChange, disabled, ...props }, ref) => {
    const { pending, handleChange } = useAsyncChange(
      onChange,
      'That setting could not be changed.',
    );
    const isDisabled = disabled || pending;
    return (
      <label
        className={cx('pump-switch', isDisabled && 'pump-switch--disabled', className)}
        htmlFor={id}
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          role="switch"
          className="pump-switch-input"
          disabled={isDisabled}
          aria-busy={pending || undefined}
          onChange={handleChange}
          {...props}
        />
        <span className="pump-switch-track" aria-hidden="true">
          <span className="pump-switch-thumb" />
        </span>
        {(label || description) && (
          <span className="pump-check-text">
            {label && <span className="pump-check-label">{label}</span>}
            {description && <span className="pump-check-desc">{description}</span>}
          </span>
        )}
      </label>
    );
  },
);
Switch.displayName = 'Switch';
