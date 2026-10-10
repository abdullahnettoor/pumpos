import React, { useId, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  choiceOfForm,
  rangeFormDefaults,
  rangeLabel,
  rangePresets,
  resolveRange,
  statementRangeFormSchema,
  type PresetId,
  type RangeChoice,
  type StatementRangeForm,
} from '../../lib/money/statementRange.js';
import { inputClass } from '../../components/handover/Fields.js';
import { BottomSheet } from '../../ui/BottomSheet.js';
import { SegmentedControl } from '../../ui/SegmentedControl.js';

const FIELD_TEXT = '!font-sans !text-[15px] !font-medium';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Today in the station's timezone: nothing is dated after it. */
  today: string;
  choice: RangeChoice;
  onApply: (choice: RangeChoice) => void;
}

/** One date field with its own label and error, so each can be marked invalid on its own. */
const DateField: React.FC<{
  label: string;
  max: string;
  error: string | undefined;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
}> = ({ label, max, error, inputProps }) => {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11.5px] font-semibold text-text-muted">
        {label}
      </label>
      <input
        id={id}
        type="date"
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${inputClass(Boolean(error))} ${FIELD_TEXT}`}
        {...inputProps}
      />
      <p
        id={errorId}
        role={error ? 'alert' : undefined}
        className="m-0 text-[11px] text-bad-fg empty:hidden"
      >
        {error}
      </p>
    </div>
  );
};

const Form: React.FC<Omit<Props, 'open'>> = ({ onClose, today, choice, onApply }) => {
  const current = resolveRange(choice, today);
  const presets = useMemo(() => rangePresets(today), [today]);
  const options = useMemo(
    () => [
      ...presets.map((p) => ({ value: p.id as PresetId, label: p.label })),
      { value: 'custom' as PresetId, label: 'Custom range' },
    ],
    [presets],
  );
  const resolver = useMemo(() => zodResolver(statementRangeFormSchema(today)), [today]);

  const {
    control,
    register,
    handleSubmit,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<StatementRangeForm>({
    resolver,
    defaultValues: rangeFormDefaults(choice, today),
  });
  const custom = watch('preset') === 'custom';

  // Choosing (clicking or arrowing to) a preset only selects it; "Apply" is the explicit step.
  const submit = handleSubmit((form) => {
    onApply(choiceOfForm(form, today));
    onClose();
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3 px-4">
      <div>
        <h2 className="m-0 text-[15px] font-bold text-text-high">Statement range</h2>
        <p className="m-0 mt-0.5 text-xs text-text-muted">
          Showing {rangeLabel(current)}. The PDF covers the same dates.
        </p>
      </div>

      <Controller
        control={control}
        name="preset"
        render={({ field }) => (
          <SegmentedControl
            label="Range"
            orientation="vertical"
            className=""
            options={options}
            value={field.value}
            onChange={(next) => {
              clearErrors();
              field.onChange(next);
            }}
          />
        )}
      />

      {custom && (
        <div className="grid grid-cols-2 gap-2.5">
          <DateField
            label="From"
            max={today}
            error={errors.from?.message}
            inputProps={register('from')}
          />
          <DateField
            label="To"
            max={today}
            error={errors.to?.message}
            inputProps={register('to')}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 items-center justify-center rounded-[13px] border border-line bg-card text-[13.5px] font-bold text-text-high"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex h-11 items-center justify-center rounded-[13px] bg-accent text-[13.5px] font-bold text-on-accent"
        >
          Apply
        </button>
      </div>
    </form>
  );
};

/**
 * Bottom sheet to pick the Statement's range: a preset (this month, last month,
 * last 3 months, this financial year) or two dates, both inclusive and never after
 * today. The presets are a radiogroup (arrow keys move the selection); nothing
 * applies, or closes the sheet, until "Apply". The form mounts only while open, so
 * it always starts from the range on screen.
 */
export const StatementFilterSheet: React.FC<Props> = ({ open, ...rest }) => (
  <BottomSheet open={open} onClose={rest.onClose} label="Filter statement">
    <Form {...rest} />
  </BottomSheet>
);
