import React from 'react';

export interface ShiftOption {
  id: string;
  label: string;
}

export interface CollectionEntryFormProps {
  shiftOptions: ShiftOption[];
  targetShiftId: string;
  onTargetShiftIdChange: (value: string) => void;
  customerId: string;
  onCustomerIdChange: (value: string) => void;
  customers: any[];
  amount: string;
  onAmountChange: (value: string) => void;
  paymentMethod: 'Cash' | 'Card' | 'UPI' | 'BankTransfer';
  onPaymentMethodChange: (value: 'Cash' | 'Card' | 'UPI' | 'BankTransfer') => void;
  notes: string;
  onNotesChange: (value: string) => void;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel?: string;
  submittingLabel?: string;
  submitDisabled?: boolean;
  amountLabel?: string;
  amountPlaceholder?: string;
  notesLabel?: string;
  notesPlaceholder?: string;
  paymentMethodLabel?: string;
  usePaymentMethodButtons?: boolean;
  walkInOptionLabel?: string;
  customerLabelCredit?: string;
  customerLabelNonCredit?: string;
  customerOptionLabel?: (customer: any) => string;
  showShiftHintWhenSingle?: boolean;
  transactionDate?: string;
  onTransactionDateChange?: (value: string) => void;
  dateLabel?: string;
}

export const CollectionEntryForm: React.FC<CollectionEntryFormProps> = ({
  shiftOptions,
  targetShiftId,
  onTargetShiftIdChange,
  customerId,
  onCustomerIdChange,
  customers,
  amount,
  onAmountChange,
  paymentMethod,
  onPaymentMethodChange,
  notes,
  onNotesChange,
  submitting,
  error,
  onCancel,
  onSubmit,
  submitLabel = 'Log Collection',
  submittingLabel = 'Saving...',
  submitDisabled,
  amountLabel = 'Amount (INR)',
  amountPlaceholder,
  notesLabel = 'Notes',
  notesPlaceholder,
  paymentMethodLabel = 'Payment Method',
  usePaymentMethodButtons = false,
  walkInOptionLabel = 'Walk-in / Not Linked',
  customerLabelCredit = 'Customer Account (Required)',
  customerLabelNonCredit = 'Customer Account (Optional for Walk-in)',
  customerOptionLabel,
  showShiftHintWhenSingle = true,
  transactionDate,
  onTransactionDateChange,
  dateLabel = 'Collection Date',
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {onTransactionDateChange && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{dateLabel}</label>
          <input
            type="date"
            value={transactionDate ?? ''}
            onChange={(e) => onTransactionDateChange(e.target.value)}
            disabled={submitting}
            style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
          />
        </div>
      )}
      {hasMultipleShiftOptions ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Target Shift</label>
          <select
            value={targetShiftId}
            onChange={(e) => onTargetShiftIdChange(e.target.value)}
            disabled={submitting}
            style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
          >
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
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{paymentMethodLabel}</label>
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
                onClick={() => onPaymentMethodChange(value)}
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
          <select
            value={paymentMethod}
            onChange={(e) => onPaymentMethodChange(e.target.value as 'Cash' | 'Card' | 'UPI' | 'BankTransfer')}
            disabled={submitting}
            style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
          >
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="UPI">UPI</option>
            <option value="BankTransfer">Bank</option>
          </select>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {customerLabelNonCredit}
        </label>
        <select
          value={customerId}
          onChange={(e) => onCustomerIdChange(e.target.value)}
          disabled={submitting}
          style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
        >
          <option value="">{walkInOptionLabel}</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customerOptionLabel ? customerOptionLabel(customer) : customer.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{amountLabel}</label>
        <input
          type="number"
          required
          placeholder={amountPlaceholder}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          disabled={submitting}
          style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{notesLabel}</label>
        <input
          type="text"
          placeholder={notesPlaceholder}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          disabled={submitting}
          style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
        />
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
        <button type="submit" disabled={submitDisabled ?? (submitting || !amount)} className="btn btn-primary btn-md">
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
};
