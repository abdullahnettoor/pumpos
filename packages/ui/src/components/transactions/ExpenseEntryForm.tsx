import React, { useEffect } from 'react';
import { expenseEntryFormSchema, type ExpenseEntryFormValues } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { Field, TextInput, NumberInput, Select, DateField } from '../primitives/Field.js';
import { AccountSelect } from '../primitives/AccountSelect.js';
import { Button } from '../../pump-ds/index.js';

export interface ShiftOption {
  id: string;
  label: string;
}

export interface ExpenseEntryFormProps {
  shiftOptions: ShiftOption[];
  categories: any[];
  /** Station whose money accounts populate the "Paid from" picker. */
  stationId?: string | null;
  defaultValues?: Partial<ExpenseEntryFormValues>;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (values: ExpenseEntryFormValues) => void | Promise<void>;
  submitLabel?: string;
  submittingLabel?: string;
  amountLabel?: string;
  categoryLabel?: string;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  categoryEmptyMessage?: string;
  showShiftHintWhenSingle?: boolean;
  /** When true, a date input is shown (standalone business-day expenses). */
  showDateField?: boolean;
  dateLabel?: string;
}

const EMPTY_DEFAULTS: ExpenseEntryFormValues = {
  targetShiftId: '',
  transactionDate: '',
  categoryId: '',
  amount: undefined as unknown as number,
  description: '',
  accountId: '',
};

export const ExpenseEntryForm: React.FC<ExpenseEntryFormProps> = ({
  shiftOptions,
  categories,
  stationId,
  defaultValues,
  submitting,
  error,
  onCancel,
  onSubmit,
  submitLabel = 'Add Expense',
  submittingLabel = 'Saving...',
  amountLabel = 'Amount (INR)',
  categoryLabel = 'Category',
  descriptionLabel = 'Description',
  descriptionPlaceholder,
  categoryEmptyMessage = 'No expense categories configured. Please add categories before recording expenses.',
  showShiftHintWhenSingle = true,
  showDateField = false,
  dateLabel = 'Expense Date',
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useZodForm<ExpenseEntryFormValues>(expenseEntryFormSchema, {
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });

  const serializedDefaults = JSON.stringify(defaultValues ?? {});
  useEffect(() => {
    reset({ ...EMPTY_DEFAULTS, ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedDefaults]);

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values))} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {showDateField && (
        <Field label={dateLabel}>
          <DateField disabled={submitting} {...register('transactionDate')} />
        </Field>
      )}
      {hasMultipleShiftOptions ? (
        <Field label="Target Shift">
          <Select disabled={submitting} {...register('targetShiftId')}>
            {shiftOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </Select>
        </Field>
      ) : showShiftHintWhenSingle && shiftOptions.length === 1 ? (
        <div style={{
          backgroundColor: 'var(--state-info-bg)',
          color: 'var(--state-info-fg)',
          padding: '10px 12px',
          borderRadius: 'var(--radius-input)',
          fontSize: '12px',
        }}>
          Logging to shift: <strong>{shiftOptions[0].label}</strong>
        </div>
      ) : null}

      <Field label={categoryLabel} error={errors.categoryId?.message}>
        {categories.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
            {categoryEmptyMessage}
          </div>
        ) : (
          <Select disabled={submitting} invalid={!!errors.categoryId} {...register('categoryId')}>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={amountLabel} error={errors.amount?.message}>
        <NumberInput disabled={submitting} invalid={!!errors.amount} {...register('amount')} />
      </Field>

      <Field label={descriptionLabel}>
        <TextInput placeholder={descriptionPlaceholder} disabled={submitting} {...register('description')} />
      </Field>

      <Field label="Paid from">
        <AccountSelect stationId={stationId} value={watch('accountId') || ''} onChange={(v) => setValue('accountId', v, { shouldValidate: true })} disabled={submitting} />
      </Field>

      {error && (
        <div style={{
          backgroundColor: 'var(--state-danger-bg)',
          color: 'var(--state-danger-fg)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-input)',
          fontSize: '12px',
          border: '1px solid var(--border-soft)'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <Button type="button" variant="secondary" size="md" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" variant="primary" size="md" loading={submitting} disabled={categories.length === 0}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};
