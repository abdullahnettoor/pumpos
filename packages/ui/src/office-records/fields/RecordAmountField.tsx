import React from 'react';
import { cn } from '../../pump-ds/lib/cn.js';

export interface RecordAmountInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  invalid?: boolean;
}

/**
 * The amount of an Office Record: the figure the drawer is built around (#526).
 * Larger than the other inputs, in mono, left-aligned beside its ₹. Other money
 * inputs (a pay-now amount, a line rate) stay `MoneyInput`.
 */
export const RecordAmountInput = React.forwardRef<HTMLInputElement, RecordAmountInputProps>(
  ({ invalid, className, ...props }, ref) => (
    <div className="record-amount">
      <span aria-hidden="true" className="record-amount-symbol">
        ₹
      </span>
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        placeholder="0.00"
        className={cn('input record-amount-input', invalid && 'input-invalid', className)}
        {...props}
      />
    </div>
  ),
);
RecordAmountInput.displayName = 'RecordAmountInput';
