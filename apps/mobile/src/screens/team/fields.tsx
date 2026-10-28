import React, { useId } from 'react';
import { inputClass } from '../../components/handover/Fields.js';

/**
 * Form fields for the team sheets. Each label is tied to its control, and each
 * hint or error is linked with aria-describedby. Text inputs use the sans face
 * (the shared `inputClass` is the mono face for amounts).
 */

const TEXT = 'resize-none py-0 !font-sans !text-[15px] !font-normal';

type TextFieldProps = { label: string; error?: string; hint?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'className'
>;

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, ...input }, ref) => {
    const id = useId();
    const noteId = `${id}-note`;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-[11.5px] font-semibold text-text-muted">
          {label}
        </label>
        <input
          id={id}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          className={`${inputClass(Boolean(error))} ${TEXT}`}
          {...input}
        />
        {(error || hint) && (
          <p id={noteId} className={`m-0 text-[11px] ${error ? 'text-bad-fg' : 'text-text-muted'}`}>
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);
TextField.displayName = 'TextField';

/** One-of-N choice shown as pills (a radiogroup): Roles, sign-in identity. */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  error,
  hint,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-[11.5px] font-semibold text-text-muted">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        aria-describedby={error || hint ? noteId : undefined}
        className="flex flex-wrap gap-2"
      >
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={disabled || undefined}
              onClick={disabled ? undefined : () => onChange(o)}
              className={`hit-44 min-h-[40px] rounded-full border px-3.5 text-[13px] font-semibold aria-disabled:cursor-not-allowed ${
                on
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-line-strong bg-card text-text-high'
              } ${disabled && !on ? 'opacity-50' : ''}`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {(error || hint) && (
        <p id={noteId} className={`m-0 text-[11px] ${error ? 'text-bad-fg' : 'text-text-muted'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** Pick any of several stations (checkboxes in one card). */
export const StationChecks: React.FC<{
  label: string;
  stations: ReadonlyArray<{ id: string; name: string }>;
  value: readonly string[];
  onChange: (value: string[]) => void;
  error?: string;
}> = ({ label, stations, value, onChange, error }) => {
  const id = useId();
  const noteId = `${id}-note`;
  const toggle = (sid: string) =>
    onChange(value.includes(sid) ? value.filter((v) => v !== sid) : [...value, sid]);
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
      aria-describedby={error ? noteId : undefined}
    >
      <legend className="mb-1.5 p-0 text-[11.5px] font-semibold text-text-muted">{label}</legend>
      {stations.length === 0 ? (
        <p className="m-0 text-[12px] text-text-muted">No stations to choose from.</p>
      ) : (
        <div
          className={`overflow-hidden rounded-[14px] border bg-card [&>*+*]:border-t [&>*+*]:border-line ${
            error ? 'border-bad' : 'border-line'
          }`}
        >
          {stations.map((s) => (
            <label key={s.id} className="flex min-h-[44px] items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                checked={value.includes(s.id)}
                onChange={() => toggle(s.id)}
                className="h-[18px] w-[18px] accent-[var(--accent)]"
              />
              <span className="text-[13.5px] font-semibold text-text-high">{s.name}</span>
            </label>
          ))}
        </div>
      )}
      {error && (
        <p id={noteId} className="m-0 text-[11px] text-bad-fg">
          {error}
        </p>
      )}
    </fieldset>
  );
};

/** On/off switch with its label and hint. */
export const SwitchField: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, hint, checked, onChange }) => {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3 rounded-[14px] border border-line bg-card px-3 py-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[13.5px] font-semibold text-text-high">
          {label}
        </label>
        {hint && <p className="m-0 mt-0.5 text-[11.5px] text-text-muted">{hint}</p>}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-[22px] w-[40px] flex-shrink-0 cursor-pointer accent-[var(--accent)]"
      />
    </div>
  );
};

/** A refusal or failure, announced where the person is looking. */
export const FormRefusal: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p
    role="alert"
    className="m-0 rounded-xl border border-bad-line bg-bad-soft px-3 py-2 text-[12.5px] text-bad-fg"
  >
    {children}
  </p>
);
