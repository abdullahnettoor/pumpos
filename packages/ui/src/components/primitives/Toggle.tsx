import React from 'react';

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  /** Muted helper line under the label. */
  description?: React.ReactNode;
}

/**
 * Native checkbox tinted with the brand colour (via `accent-color`) — accessible
 * and consistent without a bespoke re-implementation. Forwards its ref so it
 * drops into React Hook Form's `register`.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id, ...props }, ref) => (
    <label className={cx('pump-check', props.disabled && 'pump-check--disabled', className)} htmlFor={id}>
      <input ref={ref} id={id} type="checkbox" className="pump-check-input" {...props} />
      {(label || description) && (
        <span className="pump-check-text">
          {label && <span className="pump-check-label">{label}</span>}
          {description && <span className="pump-check-desc">{description}</span>}
        </span>
      )}
    </label>
  ),
);
Checkbox.displayName = 'Checkbox';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

/**
 * Boolean toggle switch. Visually a track + thumb, driven by a visually-hidden
 * native checkbox so it stays keyboard-accessible and RHF-compatible. Use for
 * instant on/off settings; use Checkbox inside forms that are submitted.
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, className, id, ...props }, ref) => (
    <label className={cx('pump-switch', props.disabled && 'pump-switch--disabled', className)} htmlFor={id}>
      <input ref={ref} id={id} type="checkbox" role="switch" className="pump-switch-input" {...props} />
      <span className="pump-switch-track" aria-hidden="true"><span className="pump-switch-thumb" /></span>
      {(label || description) && (
        <span className="pump-check-text">
          {label && <span className="pump-check-label">{label}</span>}
          {description && <span className="pump-check-desc">{description}</span>}
        </span>
      )}
    </label>
  ),
);
Switch.displayName = 'Switch';
