import React, { useCallback } from 'react';
import {
  expenseEntryFormSchema,
  resolveEntryDate,
  type ExpenseEntryFormValues,
} from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { useStationTimeZone } from '../../query/hooks.js';
import { Field, TextInput, NumberInput, Select, DateField } from '../primitives/Field.js';
import { FundingAccountSelect } from '../primitives/FundingAccountSelect.js';
import { Button, Form } from '../../pump-ds/index.js';

export interface ShiftOption {
  id: string;
  label: string;
}

export interface ExpenseEntryFormProps {
  categories: any[];
  /** Station whose funding accounts populate the account picker. */
  stationId?: string | null;
  /** Station timezone — the entry date defaults to today there. */
  timeZone?: string | null;
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
  dateLabel?: string;
  /** Label for the funding-account picker (e.g. 'Paid from' / 'Received into'). */
  accountLabel?: string;
}

const EMPTY_DEFAULTS: Omit<ExpenseEntryFormValues, 'entryDate'> = {
  categoryId: '',
  amount: undefined as unknown as number,
  description: '',
  fundingAccountId: '',
};

/**
 * An expense or other income — an Office Record (ADR 0005): it carries an entry
 * date and a funding account, never a shift.
 *
 * Remounted when the defaults change rather than reset by an effect — the same
 * treatment as PurchaseEntryForm. The defaults are the form's *initial* values,
 * so mounting fresh says that directly, and there is no effect to keep honest.
 */
export const ExpenseEntryForm: React.FC<ExpenseEntryFormProps> = (props) => (
  <ExpenseEntryFormBody key={JSON.stringify(props.defaultValues ?? {})} {...props} />
);

const ExpenseEntryFormBody: React.FC<ExpenseEntryFormProps> = ({
  categories,
  stationId,
  timeZone,
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
  dateLabel = 'Entry date',
  accountLabel = 'Paid from',
}) => {
  const stationTimeZone = useStationTimeZone(stationId);
  const today = resolveEntryDate({ timeZone: timeZone ?? stationTimeZone });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useZodForm<ExpenseEntryFormValues>(expenseEntryFormSchema, {
    defaultValues: { ...EMPTY_DEFAULTS, entryDate: today, ...defaultValues },
  });
  const onAccountChange = useCallback(
    (v: string) => setValue('fundingAccountId', v, { shouldValidate: !!v }),
    [setValue],
  );

  return (
    <Form
      onSubmit={handleSubmit((values) => onSubmit(values))}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <Field label={dateLabel} error={errors.entryDate?.message}>
        <DateField
          max={today}
          disabled={submitting}
          invalid={!!errors.entryDate}
          {...register('entryDate')}
        />
      </Field>

      <Field label={categoryLabel} error={errors.categoryId?.message}>
        {categories.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
            {categoryEmptyMessage}
          </div>
        ) : (
          <Select disabled={submitting} invalid={!!errors.categoryId} {...register('categoryId')}>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={amountLabel} error={errors.amount?.message}>
        <NumberInput disabled={submitting} invalid={!!errors.amount} {...register('amount')} />
      </Field>

      <Field label={descriptionLabel}>
        <TextInput
          placeholder={descriptionPlaceholder}
          disabled={submitting}
          {...register('description')}
        />
      </Field>

      <Field label={accountLabel} error={errors.fundingAccountId?.message}>
        <FundingAccountSelect
          stationId={stationId}
          value={watch('fundingAccountId') || ''}
          onChange={onAccountChange}
          disabled={submitting}
          invalid={!!errors.fundingAccountId}
        />
      </Field>

      {error && (
        <div
          style={{
            backgroundColor: 'var(--state-danger-bg)',
            color: 'var(--state-danger-fg)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-input)',
            fontSize: '12px',
            border: '1px solid var(--border-soft)',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={submitting}
          disabled={categories.length === 0}
        >
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
};
