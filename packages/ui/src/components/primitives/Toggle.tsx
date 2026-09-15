import React from 'react';
import { useAsyncAction } from '../../utils/useAsyncAction.js';

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
 * Native checkbox tinted with the brand colour (via `accent-color`) — accessible
 * and consistent without a bespoke re-implementation. Forwards its ref so it
 * drops into React Hook Form's `register`.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id, onChange, disabled, ...props }, ref) => {
    const { pending, run } = useAsyncAction(onChange, 'That could not be changed.');
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
          onChange={run}
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
    const { pending, run } = useAsyncAction(onChange, 'That setting could not be changed.');
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
          onChange={run}
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
