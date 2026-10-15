import React, { useId } from 'react';
import { shiftBusinessDate } from '@pump/shared';
import { Field } from '../../components/primitives/Field.js';
import { DatePickerButton } from '../../pump-ds/date-picker/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { useOfficeRecordContext } from '../context.js';

export interface RecordDateFieldProps {
  /** The form field this date fills (kept on the button as `data-name`). */
  name?: string;
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
  name,
}) => {
  const { today, disabled } = useOfficeRecordContext();
  const messageId = useId();
  const yesterday = today ? shiftBusinessDate(today, -1) : '';
  const latest = max ?? today;
  const shown =
    hint ??
    (value && value !== today
      ? 'Lands in the Daily cash book for that day.'
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
    <Field label={label} required error={error} hint={shown} messageId={messageId}>
      <div className="flex items-center gap-2">
        <div className="w-48" data-name={name}>
          <DatePickerButton
            variant="field"
            aria-label={label}
            value={value}
            max={latest || undefined}
            disabled={disabled}
            invalid={!!error}
            aria-describedby={messageId}
            onChange={onChange}
          />
        </div>
        {quick(today, 'Today')}
        {quick(yesterday, 'Yesterday')}
      </div>
    </Field>
  );
};
