import React from 'react';

/**
 * Canonical form primitives. These are the single source of truth for inputs
 * across the app — they wrap the `.input` / `.select` / `.textarea` CSS classes,
 * forward refs so they drop straight into React Hook Form's `register`, and
 * surface a consistent invalid state. Prefer these over bespoke inline-styled
 * inputs so every form looks and behaves identically.
 *
 * Pattern:
 *   <Field label="Opening cash" error={errors.openingCash?.message} required>
 *     <MoneyInput {...register('openingCash')} invalid={!!errors.openingCash} />
 *   </Field>
 */

export interface FieldProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  /** Muted helper text shown under the control (hidden when `error` is set). */
  hint?: string;
  /** Validation message; when set, renders in the danger colour. */
  error?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Field: React.FC<FieldProps> = ({ label, htmlFor, required, hint, error, children, className, style }) => (
  <div className={className} style={{ marginBottom: 'var(--space-4)', ...style }}>
    {label && (
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="field-required" aria-hidden="true">*</span>}
      </label>
    )}
    {children}
    {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
  </div>
);

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ invalid, className, ...props }, ref) => (
    <input ref={ref} className={cx('input', invalid && 'input-invalid', className)} {...props} />
  ),
);
TextInput.displayName = 'TextInput';

/**
 * Native date input styled as the canonical `.input`. Keeps the OS date picker
 * (accessible, locale-aware) while matching every other field. Use instead of
 * bespoke `type="date"` inputs.
 */
export const DateField = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ invalid, className, ...props }, ref) => (
    <input ref={ref} type="date" className={cx('input', invalid && 'input-invalid', className)} {...props} />
  ),
);
DateField.displayName = 'DateField';

export interface NumberInputProps extends TextInputProps {}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ invalid, className, ...props }, ref) => (
    <input
      ref={ref}
      type="number"
      inputMode="decimal"
      step="any"
      className={cx('input', 'input-numeric', invalid && 'input-invalid', className)}
      {...props}
    />
  ),
);
NumberInput.displayName = 'NumberInput';

/** Numeric input with a ₹ affordance; keeps figures right-aligned and mono. */
export const MoneyInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ invalid, className, style, ...props }, ref) => (
    <div style={{ position: 'relative' }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--text-faint)',
          pointerEvents: 'none',
        }}
      >
        ₹
      </span>
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        step="any"
        className={cx('input', 'input-numeric', invalid && 'input-invalid', className)}
        style={{ paddingLeft: 22, ...style }}
        {...props}
      />
    </div>
  ),
);
MoneyInput.displayName = 'MoneyInput';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid, className, ...props }, ref) => (
    <textarea ref={ref} className={cx('textarea', invalid && 'input-invalid', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid, className, children, ...props }, ref) => (
    <select ref={ref} className={cx('select', invalid && 'input-invalid', className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
