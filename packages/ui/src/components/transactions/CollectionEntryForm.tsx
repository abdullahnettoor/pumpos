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
  paymentMethod: 'Cash' | 'Card' | 'UPI' | 'Credit';
  onPaymentMethodChange: (value: 'Cash' | 'Card' | 'UPI' | 'Credit') => void;
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
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            {(['Cash', 'Card', 'UPI', 'Credit'] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => onPaymentMethodChange(method)}
                disabled={submitting}
                style={{
                  height: '32px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: paymentMethod === method ? 'var(--brand-primary)' : 'var(--bg-surface-alt)',
                  color: paymentMethod === method ? 'white' : 'var(--text-default)',
                  border: paymentMethod === method ? 'none' : '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-input)',
                  cursor: 'pointer',
                }}
              >
                {method}
              </button>
            ))}
          </div>
        ) : (
          <select
            value={paymentMethod}
            onChange={(e) => onPaymentMethodChange(e.target.value as 'Cash' | 'Card' | 'UPI' | 'Credit')}
            disabled={submitting}
            style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
          >
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="UPI">UPI</option>
            <option value="Credit">Credit</option>
          </select>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {paymentMethod === 'Credit' ? customerLabelCredit : customerLabelNonCredit}
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
