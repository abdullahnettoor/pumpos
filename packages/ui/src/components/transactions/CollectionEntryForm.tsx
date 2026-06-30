import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { collectionEntryFormSchema, type CollectionEntryFormValues } from '@pump/shared';

export interface ShiftOption {
  id: string;
  label: string;
}

export interface CollectionEntryFormProps {
  shiftOptions: ShiftOption[];
  customers: any[];
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
  showShiftHintWhenSingle?: boolean;
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

const EMPTY_DEFAULTS: CollectionEntryFormValues = {
  targetShiftId: '',
  transactionDate: '',
  customerId: '',
  amount: undefined as unknown as number,
  paymentMethod: 'Cash',
  notes: '',
};

export const CollectionEntryForm: React.FC<CollectionEntryFormProps> = ({
  shiftOptions,
  customers,
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
  showShiftHintWhenSingle = true,
  showDateField = false,
  dateLabel = 'Collection Date',
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CollectionEntryFormValues>({
    resolver: zodResolver(collectionEntryFormSchema) as any,
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });

  const serializedDefaults = JSON.stringify(defaultValues ?? {});
  useEffect(() => {
    reset({ ...EMPTY_DEFAULTS, ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedDefaults]);

  const paymentMethod = watch('paymentMethod');

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
        <label style={labelStyle}>{paymentMethodLabel}</label>
        {usePaymentMethodButtons ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
            {([
              { value: 'Cash', label: 'Cash' },
              { value: 'Card', label: 'Card' },
              { value: 'UPI', label: 'UPI' },
              { value: 'BankTransfer', label: 'Bank' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setValue('paymentMethod', value, { shouldValidate: true })}
                disabled={submitting}
                style={{
                  height: '32px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: paymentMethod === value ? 'var(--brand-primary)' : 'var(--bg-surface-alt)',
                  color: paymentMethod === value ? 'white' : 'var(--text-default)',
                  border: paymentMethod === value ? 'none' : '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-input)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <select disabled={submitting} style={fieldStyle} {...register('paymentMethod')}>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="UPI">UPI</option>
            <option value="BankTransfer">Bank</option>
          </select>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>{customerLabel}</label>
        <select disabled={submitting} style={fieldStyle} {...register('customerId')}>
          <option value="">{walkInOptionLabel}</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customerOptionLabel ? customerOptionLabel(customer) : customer.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>{amountLabel}</label>
        <input type="number" step="any" placeholder={amountPlaceholder} disabled={submitting} style={fieldStyle} {...register('amount')} />
        {errors.amount && <span style={errorTextStyle}>{errors.amount.message}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>{notesLabel}</label>
        <input type="text" placeholder={notesPlaceholder} disabled={submitting} style={fieldStyle} {...register('notes')} />
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
        <button type="submit" disabled={submitting} className="btn btn-primary btn-md">
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
};
