import React from 'react';

export interface ShiftOption {
  id: string;
  label: string;
}

export interface ExpenseEntryFormProps {
  shiftOptions: ShiftOption[];
  targetShiftId: string;
  onTargetShiftIdChange: (value: string) => void;
  categoryId: string;
  onCategoryIdChange: (value: string) => void;
  categories: any[];
  amount: string;
  onAmountChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel?: string;
  submittingLabel?: string;
  submitDisabled?: boolean;
  amountLabel?: string;
  categoryLabel?: string;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  categoryEmptyMessage?: string;
  showShiftHintWhenSingle?: boolean;
}

export const ExpenseEntryForm: React.FC<ExpenseEntryFormProps> = ({
  shiftOptions,
  targetShiftId,
  onTargetShiftIdChange,
  categoryId,
  onCategoryIdChange,
  categories,
  amount,
  onAmountChange,
  description,
  onDescriptionChange,
  submitting,
  error,
  onCancel,
  onSubmit,
  submitLabel = 'Add Expense',
  submittingLabel = 'Saving...',
  submitDisabled,
  amountLabel = 'Amount (INR)',
  categoryLabel = 'Category',
  descriptionLabel = 'Description',
  descriptionPlaceholder,
  categoryEmptyMessage = 'No expense categories configured. Please add categories before recording expenses.',
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
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{categoryLabel}</label>
        {categories.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
            {categoryEmptyMessage}
          </div>
        ) : (
          <select
            value={categoryId}
            onChange={(e) => onCategoryIdChange(e.target.value)}
            disabled={submitting}
            style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{amountLabel}</label>
        <input
          type="number"
          required
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          disabled={submitting}
          style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{descriptionLabel}</label>
        <input
          type="text"
          placeholder={descriptionPlaceholder}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
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
        <button type="submit" disabled={submitDisabled ?? (submitting || !amount || categories.length === 0)} className="btn btn-primary btn-md">
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
};
