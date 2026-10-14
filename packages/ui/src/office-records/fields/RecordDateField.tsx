import React from 'react';
import { shiftBusinessDate } from '@pump/shared';
import { DateField, Field } from '../../components/primitives/Field.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { formatBusinessDate } from '../../utils/format.js';
import { useOfficeRecordContext } from '../context.js';

export interface RecordDateFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Replaces the default hint (e.g. a purchase's dating rule). */
  hint?: string;
  /** The latest date allowed; today's Entry Date by default. */
  max?: string;
  error?: string;
}

/**
 * The date of an Office Record with Today / Yesterday shortcuts. An Entry Date
 * is the station's calendar date, never rolled back by Day Start (ADR 0005).
 */
export const RecordDateField: React.FC<RecordDateFieldProps> = ({
  label = 'Entry date',
  value,
  onChange,
  hint,
  max,
  error,
  ...rest
}) => {
  const { today, disabled } = useOfficeRecordContext();
  const yesterday = today ? shiftBusinessDate(today, -1) : '';
  const latest = max ?? today;
  const shown =
    hint ??
    (value && value !== today
      ? `Lands in the Daily cash book for ${formatBusinessDate(value)}.`
      : 'Office record: dated, not part of any shift.');

  const quick = (date: string, text: string) => (
    <button
      type="button"
      disabled={disabled || !date || (!!latest && date > latest)}
      onClick={() => onChange(date)}
      aria-pressed={value === date}
      className={cn(
        'rounded-chip border px-2 py-0.5 text-[12px] disabled:opacity-50',
        value === date
          ? 'border-brand bg-brand/10 text-brand'
          : 'border-border-soft text-ink-muted hover:text-ink-strong',
      )}
    >
      {text}
    </button>
  );

  return (
    <Field label={label} required error={error} hint={shown}>
      <div className="flex items-center gap-2">
        <div className="w-44">
          <DateField
            {...rest}
            aria-label={label}
            value={value}
            max={latest || undefined}
            disabled={disabled}
            invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        {quick(today, 'Today')}
        {quick(yesterday, 'Yesterday')}
      </div>
    </Field>
  );
};
