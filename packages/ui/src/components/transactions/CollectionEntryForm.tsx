import React, { useEffect } from 'react';
import { collectionEntryFormSchema, type CollectionEntryFormValues } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { Field, TextInput, NumberInput, Select, DateField } from '../primitives/Field.js';
import { Segmented } from '../primitives/Segmented.js';
import { Combobox } from '../primitives/Combobox.js';
import { AccountSelect } from '../primitives/AccountSelect.js';

export interface ShiftOption {
  id: string;
  label: string;
}
export interface CollectionEntryFormProps {
  shiftOptions: ShiftOption[];
  customers: any[];
  /** Station whose bank accounts populate the deposit picker (non-cash). */
  stationId?: string | null;
  defaultValues?: Partial<CollectionEntryFormValues>;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (values: CollectionEntryFormValues) => void | Promise<void>;
  submitLabel?: string;
  submittingLabel?: string;
  amountLabel?: string;
  amountPlaceholder?: string;
  notesLabel?: string;
  notesPlaceholder?: string;
  paymentMethodLabel?: string;
  usePaymentMethodButtons?: boolean;
  walkInOptionLabel?: string;
  customerLabel?: string;
  customerOptionLabel?: (customer: any) => string;
  /** Collections are receivable payments — require a customer (no walk-in). */
  requireCustomer?: boolean;
  showShiftHintWhenSingle?: boolean;
  showDateField?: boolean;
  dateLabel?: string;
}

const EMPTY_DEFAULTS: CollectionEntryFormValues = {
  targetShiftId: '',
  transactionDate: '',
  customerId: '',
  amount: undefined as unknown as number,
  paymentMethod: 'Cash',
  notes: '',
  accountId: '',
};

export const CollectionEntryForm: React.FC<CollectionEntryFormProps> = ({
  shiftOptions,
  customers,
  stationId,
  defaultValues,
  submitting,
  error,
  onCancel,
  onSubmit,
  submitLabel = 'Log Collection',
  submittingLabel = 'Saving...',
  amountLabel = 'Amount (INR)',
  amountPlaceholder,
  notesLabel = 'Notes',
  notesPlaceholder,
  paymentMethodLabel = 'Payment Method',
  usePaymentMethodButtons = false,
  walkInOptionLabel = 'Walk-in / Not Linked',
  customerLabel = 'Customer Account (Optional for Walk-in)',
  customerOptionLabel,
  requireCustomer = false,
  showShiftHintWhenSingle = true,
  showDateField = false,
  dateLabel = 'Collection Date',
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;

  const { register, handleSubmit, reset, watch, setValue, setError, clearErrors, formState: { errors } } = useZodForm<CollectionEntryFormValues>(collectionEntryFormSchema, {
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });

  const serializedDefaults = JSON.stringify(defaultValues ?? {});
  useEffect(() => {
    reset({ ...EMPTY_DEFAULTS, ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedDefaults]);

  const paymentMethod = watch('paymentMethod');
  const customerId = watch('customerId');

  return (
    <form onSubmit={handleSubmit((values) => {
      if (requireCustomer && !values.customerId) {
        setError('customerId', { type: 'manual', message: 'Select a customer for this collection.' });
        return;
      }
      return onSubmit(values);
    })} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

      <Field label={paymentMethodLabel}>
        {usePaymentMethodButtons ? (
          <Segmented
            options={[
              { value: 'Cash', label: 'Cash' },
              { value: 'Card', label: 'Card' },
              { value: 'UPI', label: 'UPI' },
              { value: 'BankTransfer', label: 'Bank' },
            ]}
            value={paymentMethod}
            onChange={(v) => { setValue('paymentMethod', v as typeof paymentMethod, { shouldValidate: true }); if (v === 'Cash') setValue('accountId', ''); }}
            disabled={submitting}
            aria-label={paymentMethodLabel}
          />
        ) : (
          <Select disabled={submitting} {...register('paymentMethod')}>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="UPI">UPI</option>
            <option value="BankTransfer">Bank</option>
          </Select>
        )}
      </Field>

      <Field label={requireCustomer ? 'Customer Account' : customerLabel} error={errors.customerId?.message as string | undefined}>
        <Combobox
          options={[
            ...(requireCustomer ? [] : [{ value: '', label: walkInOptionLabel }]),
            ...customers.map((customer) => ({
              value: customer.id,
              label: customerOptionLabel ? customerOptionLabel(customer) : customer.name,
            })),
          ]}
          value={customerId ?? ''}
          onChange={(v) => { setValue('customerId', v, { shouldValidate: true }); if (v) clearErrors('customerId'); }}
          placeholder={requireCustomer ? 'Select a customer…' : walkInOptionLabel}
          searchPlaceholder="Search customers…"
          disabled={submitting}
        />
      </Field>

      <Field label={amountLabel} error={errors.amount?.message}>
        <NumberInput placeholder={amountPlaceholder} disabled={submitting} invalid={!!errors.amount} {...register('amount')} />
      </Field>

      {paymentMethod !== 'Cash' && (
        <Field label="Deposit to (Bank)">
          <AccountSelect stationId={stationId} value={watch('accountId') || ''} onChange={(v) => setValue('accountId', v, { shouldValidate: true })} types={['BANK']} disabled={submitting} autoLabel="Auto (default bank)" />
        </Field>
      )}

      <Field label={notesLabel}>
        <TextInput placeholder={notesPlaceholder} disabled={submitting} {...register('notes')} />
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
        <button type="button" onClick={onCancel} disabled={submitting} className="btn btn-secondary btn-md">Cancel</button>
        <button type="submit" disabled={submitting} className="btn btn-primary btn-md">
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
};
