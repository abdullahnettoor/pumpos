import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { expenseEntryFormSchema, type ExpenseEntryFormValues } from '@pump/shared';

export interface ShiftOption {
  id: string;
  label: string;
}

export interface ExpenseEntryFormProps {
  shiftOptions: ShiftOption[];
  categories: any[];
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

const fieldStyle: React.CSSProperties = {
  height: '32px',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  padding: '0 8px',
};
const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 };
const errorTextStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--brand-danger)' };

const EMPTY_DEFAULTS: ExpenseEntryFormValues = {
  targetShiftId: '',
  transactionDate: '',
  categoryId: '',
  amount: undefined as unknown as number,
  description: '',
};

export const ExpenseEntryForm: React.FC<ExpenseEntryFormProps> = ({
  shiftOptions,
  categories,
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

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ExpenseEntryFormValues>({
    resolver: zodResolver(expenseEntryFormSchema) as any,
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>{dateLabel}</label>
          <input type="date" disabled={submitting} style={fieldStyle} {...register('transactionDate')} />
        </div>
      )}
      {hasMultipleShiftOptions ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Target Shift</label>
          <select disabled={submitting} style={fieldStyle} {...register('targetShiftId')}>
            {shiftOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>{categoryLabel}</label>
        {categories.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
            {categoryEmptyMessage}
          </div>
        ) : (
          <select disabled={submitting} style={fieldStyle} {...register('categoryId')}>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        )}
        {errors.categoryId && <span style={errorTextStyle}>{errors.categoryId.message}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>{amountLabel}</label>
        <input type="number" step="any" disabled={submitting} style={fieldStyle} {...register('amount')} />
        {errors.amount && <span style={errorTextStyle}>{errors.amount.message}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>{descriptionLabel}</label>
        <input type="text" placeholder={descriptionPlaceholder} disabled={submitting} style={fieldStyle} {...register('description')} />
      </div>

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
        <button type="button" onClick={onCancel} disabled={submitting} className="btn btn-secondary btn-md">Cancel</button>
        <button type="submit" disabled={submitting || categories.length === 0} className="btn btn-primary btn-md">
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
};
