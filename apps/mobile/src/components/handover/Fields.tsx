import React, { useId } from 'react';

/**
 * Form fields for the handover steps. Amounts, readings and quantities use the
 * mono `.num` face. The label wraps only its own text and input so the field's
 * accessible name stays the label; hints and errors sit outside it and are
 * linked with aria-describedby.
 */

const INPUT_BASE =
  'num min-w-0 w-full rounded-xl border bg-card-alt px-3 text-[17px] font-semibold text-text-high ' +
  'placeholder:font-normal placeholder:text-text-faint focus:outline-none focus:ring-[3px]';

const inputTone = (error: boolean) =>
  error
    ? 'border-bad focus:border-bad focus:ring-bad/20'
    : 'border-line-strong focus:border-accent focus:ring-accent/20';

export const inputClass = (error = false, height = 'h-[46px]') =>
  `${INPUT_BASE} ${height} ${inputTone(error)}`;

export const NumberField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Figure shown under the input, e.g. "Opening 1,000". */
  meta?: string;
  sub?: string;
  placeholder?: string;
  min?: number;
  error?: string;
}> = ({ label, value, onChange, meta, sub, placeholder, min = 0, error }) => {
  const noteId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-semibold text-text-muted">{label}</span>
        <input
          type="number"
          inputMode="decimal"
          min={min}
          value={value}
          placeholder={placeholder ?? '0'}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || sub || meta ? noteId : undefined}
          className={inputClass(Boolean(error))}
        />
      </label>
      {error ? (
        <p id={noteId} className="text-[11px] text-bad-fg">
          {error}
        </p>
      ) : meta || sub ? (
        <div id={noteId} className="flex flex-col text-[11px] text-text-muted">
          {meta ? <span className="num">{meta}</span> : null}
          {sub ? <span>{sub}</span> : null}
        </div>
      ) : null}
    </div>
  );
};

export const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[11.5px] font-semibold text-text-muted">{label}</span>
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-[46px] w-full rounded-xl border border-line-strong bg-card-alt px-3 text-sm text-text-high placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
    />
  </label>
);

export const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[11.5px] font-semibold text-text-muted">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[46px] w-full rounded-xl border border-line-strong bg-card-alt px-3 text-sm text-text-high focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
    >
      {children}
    </select>
  </label>
);

/** A dashed full-width "+ Add …" action. */
export const AddButton: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}> = ({ onClick, children, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-[12.5px] font-bold text-accent disabled:opacity-50"
  >
    {children}
  </button>
);
